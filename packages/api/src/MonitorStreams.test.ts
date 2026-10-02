import { MonitorDefinition } from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { Context, Duration, Effect, Fiber, Layer, Option, Ref, Result, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import * as Database from './Database'
import * as MonitorRepository from './MonitorRepository'
import * as MonitorStreams from './MonitorStreams'
import { observation, servicesLayer } from './testing'
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
    expectedStatus: 200,
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
    expectedStatus: 200,
  }),
)

const checkUptime = () => Effect.succeed(observation())

const layers = (databasePath = ':memory:') => servicesLayer({ databasePath, checkUptime })

const seedMonitor = (databasePath: string) =>
  MonitorRepository.layer.pipe(
    Layer.provide(Database.layer(databasePath)),
    Layer.tap((context) => Context.get(context, MonitorRepository.MonitorRepository).register(definition)),
  )

describe('MonitorStreams', () => {
  it.effect('starts a stream when a monitor is registered', () =>
    Effect.gen(function* () {
      // Arrange
      const streams = yield* MonitorStreams.MonitorStreams
      const repository = yield* MonitorRepository.MonitorRepository
      const events = yield* WatchdogEvents.WatchdogEvents
      const collected = yield* streams.observations.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow

      // Act
      const created = yield* repository.register(definition)
      yield* events.publish({ _tag: 'MonitorRegistered', monitor: created })

      // Assert
      const [observed] = Array.from(yield* Fiber.join(collected))
      expect(observed?.monitor.id).toBe(created.id)
      expect(observed?.monitor.name).toBe('Prod API')
      expect(Result.isSuccess(observed!.observation.response)).toBe(true)
    }).pipe(Effect.provide(layers())),
  )

  it.effect('runs an immediate check and publishes its observation', () =>
    Effect.gen(function* () {
      // Arrange
      const streams = yield* MonitorStreams.MonitorStreams
      const repository = yield* MonitorRepository.MonitorRepository
      const collected = yield* streams.observations.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow

      const created = yield* repository.register(definition)

      // Act
      const observation = yield* streams.checkNow(created)

      // Assert
      const [observed] = Array.from(yield* Fiber.join(collected))
      expect(observed?.monitor.id).toBe(created.id)
      expect(observed?.observation).toEqual(observation)
      expect(Result.isSuccess(observation.response)).toBe(true)
    }).pipe(Effect.provide(layers())),
  )

  it.effect('restarts the stream when a monitor is updated', () =>
    Effect.gen(function* () {
      // Arrange
      const streams = yield* MonitorStreams.MonitorStreams
      const repository = yield* MonitorRepository.MonitorRepository
      const events = yield* WatchdogEvents.WatchdogEvents

      const collected = yield* streams.observations.pipe(Stream.take(2), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow

      const created = yield* repository.register(definition)
      yield* events.publish({ _tag: 'MonitorRegistered', monitor: created })
      yield* Effect.yieldNow

      // Act
      const renamed = yield* repository.update(created.id, updatedDefinition)
      yield* events.publish({ _tag: 'MonitorUpdated', monitor: Option.getOrThrow(renamed) })

      // Assert
      const [first, second] = Array.from(yield* Fiber.join(collected))
      expect(first?.monitor.id).toBe(created.id)
      expect(first?.monitor.name).toBe('Prod API')
      expect(second?.monitor.name).toBe('Renamed API')
    }).pipe(Effect.provide(layers())),
  )

  it.effect('starts streams for monitors saved before startup', () => {
    const databasePath = `/tmp/opencode/watchdog-${crypto.randomUUID()}.db`

    return Effect.gen(function* () {
      yield* Effect.scoped(Layer.build(seedMonitor(databasePath)))

      return yield* Effect.gen(function* () {
        // Arrange
        const streams = yield* MonitorStreams.MonitorStreams
        const repository = yield* MonitorRepository.MonitorRepository
        const [saved] = yield* repository.list

        const collected = yield* streams.observations.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
        yield* Effect.yieldNow
        yield* TestClock.adjust(Duration.minutes(1))
        yield* Effect.yieldNow
        yield* TestClock.adjust(Duration.minutes(1))

        // Assert
        const [observed] = Array.from(yield* Fiber.join(collected))
        expect(observed?.monitor.id).toBe(saved?.id)
        expect(observed?.monitor.name).toBe('Prod API')
        expect(Result.isSuccess(observed!.observation.response)).toBe(true)
      }).pipe(Effect.provide(layers(databasePath)))
    })
  })

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

      const probe = yield* streams.observations.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
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
    }).pipe(Effect.provide(layers())),
  )
})
