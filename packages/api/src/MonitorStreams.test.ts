import { MonitorDefinition } from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { Context, Duration, Effect, Fiber, Layer, Result, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import * as CheckUptime from './CheckUptime'
import * as Database from './Database'
import * as MonitorEvents from './MonitorEvents'
import * as MonitorRepository from './MonitorRepository'
import * as MonitorStreams from './MonitorStreams'

const definition = Effect.runSync(
  Schema.decodeUnknownEffect(MonitorDefinition)({
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
  const events = MonitorEvents.layer
  const repository = MonitorRepository.layer.pipe(Layer.provide(events), Layer.provide(database))
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
  return Layer.merge(streams, repository)
}

describe('MonitorStreams', () => {
  it.effect('starts a stream when a monitor is registered', () =>
    Effect.gen(function* () {
      // Arrange
      const streams = yield* MonitorStreams.MonitorStreams
      const repository = yield* MonitorRepository.MonitorRepository
      const collected = yield* streams.observations.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      // Act
      const created = yield* repository.register(definition)

      // Assert
      const [observed] = Array.from(yield* Fiber.join(collected))
      expect(observed?.monitorId).toBe(created.id)
      expect(Result.isSuccess(observed!.observation.response)).toBe(true)
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
      expect(Result.isSuccess(observed!.observation.response)).toBe(true)
    }).pipe(Effect.provide(makeLayers(true))),
  )
})
