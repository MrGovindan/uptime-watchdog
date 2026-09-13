import { Monitor } from '@uptime-watchdog/common'
import { Context, Effect, Layer, PubSub, Schema, Stream } from 'effect'

export const MonitorEvent = Schema.TaggedUnion({
  MonitorRegistered: { monitor: Monitor },
})
export type MonitorEvent = typeof MonitorEvent.Type

export interface Interface {
  readonly publish: (event: MonitorEvent) => Effect.Effect<void>
  readonly stream: Stream.Stream<MonitorEvent>
}

export class MonitorEvents extends Context.Service<MonitorEvents, Interface>()('MonitorEvents') {}

const make = Effect.gen(function* () {
  const pubsub = yield* PubSub.unbounded<MonitorEvent>()

  const publish = Effect.fn('MonitorEvents.publish')((event: MonitorEvent) =>
    PubSub.publish(pubsub, event).pipe(Effect.asVoid),
  )

  return {
    publish,
    stream: Stream.fromPubSub(pubsub),
  } satisfies Interface
})

export const layer = Layer.effect(MonitorEvents, make)
