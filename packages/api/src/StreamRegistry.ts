import { Context, Effect, FiberMap, Layer, PubSub, Stream } from 'effect'

export interface Interface<Key, T, R = never> {
  readonly add: (key: Key, stream: Stream.Stream<T, never, R>) => Effect.Effect<void, never, R>
  readonly stream: Stream.Stream<readonly [Key, T]>
}

export const tag = <Key, T, R = never>() => Context.Service<Interface<Key, T, R>>('StreamRegistry')

const make = <Key, T, R>() =>
  Effect.gen(function* () {
    const fibers = yield* FiberMap.make<Key>()
    const pubsub = yield* PubSub.unbounded<readonly [Key, T]>()

    const add = (key: Key, stream: Stream.Stream<T, never, R>): Effect.Effect<void, never, R> =>
      FiberMap.run(
        fibers,
        key,
        Stream.runForEach(stream, (value) => PubSub.publish(pubsub, [key, value])),
      ).pipe(Effect.asVoid)

    return {
      add,
      stream: Stream.fromPubSub(pubsub),
    } satisfies Interface<Key, T, R>
  })

export const layer = <Key, T, R = never>() => Layer.effect(tag<Key, T, R>(), make<Key, T, R>())
