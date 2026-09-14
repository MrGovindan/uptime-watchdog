import { MonitorDefinition } from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import {
  Context,
  Duration,
  Effect,
  Fiber,
  Layer,
  Option,
  Ref,
  Result,
  Schema,
  Stream,
} from 'effect'
import { TestClock } from 'effect/testing'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import * as CheckUptime from './CheckUptime'
import * as Database from './Database'
import * as MonitorRepository from './MonitorRepository'
import * as MonitorStreams from './MonitorStreams'
import * as WatchdogEvents from './WatchdogEvents'

const definition = Effect.runSync(
  Schema.decodeUnknownEffect(MonitorDefinition)({
    name: 'Prod API',
    request: {
      hostname: 'example.test',
      port: 8080,
      protocol: 'https',
      method: 'GET',
      headers: {},
    },
    cronSchedule: '* * * * *',
  }),
)

const updatedDefinition = Effect.runSync(
  Schema.decodeUnknownEffect(MonitorDefinition)({
    name: 'Renamed API',
    request: {
      hostname: 'example.test',
      port: 8080,
      protocol: 'https',
      method: 'GET',
      headers: {},
    },
    cronSchedule: '* * * * *',
  }),
)

const httpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, new Response('pong', { status: 200 }))),
  ),
)

const makeLayers = (seed: boolean) => {
  const database = Database.layer(':memory:')
  const events = WatchdogEvents.layer
  const repository = MonitorRepository.layer.pipe(Layer.provide(database))
  const seeded = seed
    ? repository.pipe(
        Layer.tap((context) =>
          Context.get(context, MonitorRepository.MonitorRepository).register(definition),
        ),
      )
    : repository
  const streams = MonitorStreams.layer.pipe(
    Layer.provide(events),
    Layer.provide(seeded),
    Layer.provide(CheckUptime.layer),
    Layer.provide(httpClient),
  )
  return Layer.mergeAll(streams, repository, events)
}

describe('MonitorStreams', () => {
  it.effect('starts a stream when a monitor is registered', () =>
    Effect.gen(function* () {
      // Arrange
      const streams = yield* MonitorStreams.MonitorStreams
      const repository = yield* MonitorRepository.MonitorRepository
      const events = yield* WatchdogEvents.WatchdogEvents
      const collected = yield* streams.observations.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      // Act
      const created = yield* repository.register(definition)
      yield* events.publish({ _tag: 'MonitorRegistered', monitor: created })

      // Assert
      const [observed] = Array.from(yield* Fiber.join(collected))
      expect(observed?.monitorId).toBe(created.id)
      expect(observed?.monitorName).toBe('Prod API')
      expect(Result.isSuccess(observed!.observation.response)).toBe(true)
    }).pipe(Effect.provide(makeLayers(false))),
  )

  it.effect('restarts the stream when a monitor is updated', () =>
    Effect.gen(function* () {
      // Arrange
      const streams = yield* MonitorStreams.MonitorStreams
      const repository = yield* MonitorRepository.MonitorRepository
      const events = yield* WatchdogEvents.WatchdogEvents

      const collected = yield* streams.observations.pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      const created = yield* repository.register(definition)
      yield* events.publish({ _tag: 'MonitorRegistered', monitor: created })
      yield* Effect.yieldNow

      // Act
      const renamed = yield* repository.update(created.id, updatedDefinition)
      yield* events.publish({ _tag: 'MonitorUpdated', monitor: Option.getOrThrow(renamed) })

      // Assert
      const [first, second] = Array.from(yield* Fiber.join(collected))
      expect(first?.monitorId).toBe(created.id)
      expect(first?.monitorName).toBe('Prod API')
      expect(second?.monitorName).toBe('Renamed API')
    }).pipe(Effect.provide(makeLayers(false))),
  )

  it.effect('starts streams for monitors saved before startup', () =>
    Effect.gen(function* () {
      // Arrange
      const streams = yield* MonitorStreams.MonitorStreams
      const repository = yield* MonitorRepository.MonitorRepository
      const [saved] = yield* repository.list

      const collected = yield* streams.observations.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      yield* TestClock.adjust(Duration.minutes(1))
      yield* Effect.yieldNow
      yield* TestClock.adjust(Duration.minutes(1))

      // Assert
      const [observed] = Array.from(yield* Fiber.join(collected))
      expect(observed?.monitorId).toBe(saved?.id)
      expect(observed?.monitorName).toBe('Prod API')
      expect(Result.isSuccess(observed!.observation.response)).toBe(true)
    }).pipe(Effect.provide(makeLayers(true))),
  )

  it.effect('stops the stream when the monitor is deleted', () =>
    Effect.gen(function* () {
      // Arrange
      const streams = yield* MonitorStreams.MonitorStreams
      const repository = yield* MonitorRepository.MonitorRepository
      const events = yield* WatchdogEvents.WatchdogEvents
      const observed = yield* Ref.make(0)

      yield* streams.observations.pipe(
        Stream.runForEach(() => Ref.update(observed, (count) => count + 1)),
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      const probe = yield* streams.observations.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      // Act
      const created = yield* repository.register(definition)
      yield* events.publish({ _tag: 'MonitorRegistered', monitor: created })
      yield* Fiber.join(probe)
      yield* Effect.yieldNow
      expect(yield* Ref.get(observed)).toBe(1)

      yield* events.publish({ _tag: 'MonitorDeleted', monitor: created, targets: [] })
      yield* Effect.yieldNow
      yield* TestClock.adjust(Duration.minutes(1))
      yield* Effect.yieldNow

      // Assert
      expect(yield* Ref.get(observed)).toBe(1)
    }).pipe(Effect.provide(makeLayers(false))),
  )
})
