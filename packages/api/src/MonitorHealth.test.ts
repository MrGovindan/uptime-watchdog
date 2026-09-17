import type { MonitorObservation } from '@uptime-watchdog/common'
import { Monitor } from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { DateTime, Duration, Effect, Layer, Option, Queue, Result, Schema, Stream } from 'effect'
import * as MonitorStreams from './MonitorStreams'
import * as HealthService from './MonitorHealth'
import * as WatchdogEvents from './WatchdogEvents'
import { type WatchdogEvent } from '@uptime-watchdog/common'

const monitor = Effect.runSync(
  Schema.decodeUnknownEffect(Monitor.json)({
    id: '2f1c9b3e-4a5d-4f6a-8b7c-1d2e3f4a5b6c',
    name: 'Prod API',
    request: {
      hostname: 'example.test',
      port: 8080,
      protocol: 'https',
      method: 'GET',
      headers: {},
    },
    cronSchedule: '*/5 * * * *',
    expectedStatus: 200,
    createdAt: '2026-09-13T00:00:00.000Z',
  }),
)

const observation = (status: number): MonitorObservation => ({
  monitor,
  observation: {
    time: DateTime.nowUnsafe(),
    response: Result.succeed({ duration: Duration.millis(5), status, body: 'pong' }),
  },
})

const makeEnvironment = () => {
  const observations = Effect.runSync(Queue.unbounded<MonitorObservation>())
  const streamsStub = Layer.succeed(MonitorStreams.MonitorStreams, {
    start: () => Effect.void,
    observations: Stream.fromQueue(observations),
  })
  const events = WatchdogEvents.layer
  const layer = Layer.provideMerge(
    HealthService.layer.pipe(Layer.provide(streamsStub), Layer.provide(events)),
    events,
  )

  return { observations, layer }
}

const subscribe = (events: WatchdogEvents.Interface) =>
  Effect.gen(function* () {
    const collected = yield* Queue.unbounded<WatchdogEvent>()
    const forEach = events.stream.pipe(
      Stream.runForEach((event) => Queue.offer(collected, event).pipe(Effect.asVoid)),
    )
    yield* forEach.pipe(Effect.forkChild)
    yield* Effect.yieldNow
    return collected
  })

const withEvents = Effect.gen(function* () {
  const events = yield* WatchdogEvents.WatchdogEvents
  const delivered = yield* subscribe(events)
  return { events, delivered }
})

const waitForSome = <Some, None>(
  effect: Effect.Effect<Option.Option<Some>, None>,
  predicate: (value: Option.Option<Some>) => boolean,
  attemptsLeft = 1000,
): Effect.Effect<Option.Option<Some>, None> =>
  Effect.flatMap(effect, (value) =>
    predicate(value)
      ? Effect.succeed(value)
      : attemptsLeft > 0
        ? Effect.flatMap(Effect.yieldNow, () => waitForSome(effect, predicate, attemptsLeft - 1))
        : Effect.die('waitForSome exceeded'),
  )

describe('MonitorHealth', () => {
  it.effect('publishes healthy, degraded, and healed transitions', () => {
    const env = makeEnvironment()
    return Effect.gen(function* () {
      const { delivered } = yield* withEvents

      yield* Queue.offer(env.observations, observation(200))
      expect(yield* Queue.take(delivered)).toMatchObject({
        _tag: 'MonitorHealthy',
        monitor: { id: monitor.id },
        health: { _tag: 'Healthy', response: { status: 200 } },
      })

      yield* Queue.offer(env.observations, observation(500))
      expect(yield* Queue.take(delivered)).toMatchObject({
        _tag: 'MonitorDegraded',
        health: { _tag: 'Degraded', reason: { _tag: 'Unexpected', response: { status: 500 } } },
      })

      yield* Queue.offer(env.observations, observation(200))
      expect(yield* Queue.take(delivered)).toMatchObject({
        _tag: 'MonitorHealed',
        health: { _tag: 'Healthy' },
      })

      expect(Option.isNone(yield* Queue.poll(delivered))).toBe(true)
    }).pipe(Effect.provide(env.layer))
  })

  it.effect('reports degradation before the monitor has ever been healthy', () => {
    const env = makeEnvironment()
    return Effect.gen(function* () {
      const { delivered } = yield* withEvents

      yield* Queue.offer(env.observations, observation(503))
      expect(yield* Queue.take(delivered)).toMatchObject({ _tag: 'MonitorDegraded' })

      expect(Option.isNone(yield* Queue.poll(delivered))).toBe(true)
    }).pipe(Effect.provide(env.layer))
  })

  it.effect('does not republish when the health state does not change', () => {
    const env = makeEnvironment()
    return Effect.gen(function* () {
      const { delivered } = yield* withEvents

      yield* Queue.offer(env.observations, observation(200))
      expect(yield* Queue.take(delivered)).toMatchObject({ _tag: 'MonitorHealthy' })

      yield* Queue.offer(env.observations, observation(200))
      expect(Option.isNone(yield* Queue.poll(delivered))).toBe(true)
    }).pipe(Effect.provide(env.layer))
  })

  it.effect('exposes the current health and forgets a deleted monitor', () => {
    const env = makeEnvironment()
    return Effect.gen(function* () {
      const { events } = yield* withEvents
      const health = yield* HealthService.MonitorHealth
      const monitorId = monitor.id

      expect(Option.isNone(yield* health.getHealth(monitorId))).toBe(true)

      yield* Queue.offer(env.observations, observation(500))
      const degraded = Option.getOrThrow(
        yield* waitForSome(health.getHealth(monitorId), Option.isSome),
      )
      expect(degraded._tag).toBe('Degraded')

      yield* events.publish({ _tag: 'MonitorDeleted', monitor, targets: [] })
      yield* Effect.yieldNow
      expect(Option.isNone(yield* health.getHealth(monitorId))).toBe(true)
    }).pipe(Effect.provide(env.layer))
  })
})
