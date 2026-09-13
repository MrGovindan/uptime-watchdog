import { describe, expect, it } from '@effect/vitest'
import { Deferred, Effect, Fiber, Stream } from 'effect'
import { layer, tag } from './StreamRegistry'

const Registry = tag<string, number>()

describe('StreamRegistry', () => {
  it.effect('merges keyed streams into a single stream tagged by key', () =>
    Effect.gen(function* () {
      // Arrange
      const registry = yield* Registry
      const collected = yield* registry.stream.pipe(
        Stream.take(3),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      // Act
      yield* registry.add('a', Stream.fromIterable([1, 2]))
      yield* registry.add('b', Stream.fromIterable([3]))

      // Assert
      const values = yield* Fiber.join(collected)
      expect(new Set(Array.from(values))).toEqual(
        new Set([
          ['a', 1],
          ['b', 3],
          ['a', 2],
        ]),
      )
    }).pipe(Effect.provide(layer<string, number>())),
  )

  it.effect('replacing a key interrupts the previous stream', () =>
    Effect.gen(function* () {
      // Arrange
      const registry = yield* Registry
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()

      const collected = yield* registry.stream.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      // Act
      yield* registry.add('a', Stream.fromEffect(Deferred.await(first).pipe(Effect.as(1))))
      yield* registry.add('a', Stream.fromEffect(Deferred.await(second).pipe(Effect.as(2))))
      yield* Deferred.succeed(first, undefined)
      yield* Deferred.succeed(second, undefined)

      // Assert
      const values = yield* Fiber.join(collected)
      expect(Array.from(values)).toEqual([['a', 2]])
    }).pipe(Effect.provide(layer<string, number>())),
  )
})
