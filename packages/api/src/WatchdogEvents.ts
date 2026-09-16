import { Monitor, MonitorHealth, NotificationTarget } from '@uptime-watchdog/common'
import { Context, Effect, Layer, PubSub, Schema, Stream } from 'effect'

export const WatchdogEvent = Schema.TaggedUnion({
  MonitorRegistered: { monitor: Monitor },
  MonitorUpdated: { monitor: Monitor },
  MonitorDeleted: { monitor: Monitor, targets: Schema.Array(NotificationTarget) },
  NotificationTargetAdded: { monitor: Monitor, target: NotificationTarget },
  NotificationTargetRemoved: { monitor: Monitor, target: NotificationTarget },
  MonitorHealthy: { monitor: Monitor, health: MonitorHealth },
  MonitorDegraded: { monitor: Monitor, health: MonitorHealth },
  MonitorHealed: { monitor: Monitor, health: MonitorHealth },
})
export type WatchdogEvent = typeof WatchdogEvent.Type

export interface Interface {
  readonly publish: (event: WatchdogEvent) => Effect.Effect<void>
  readonly stream: Stream.Stream<WatchdogEvent>
}

export class WatchdogEvents extends Context.Service<WatchdogEvents, Interface>()(
  'WatchdogEvents',
) {}

const make = Effect.gen(function* () {
  const pubsub = yield* PubSub.unbounded<WatchdogEvent>()

  const publish = Effect.fn('WatchdogEvents.publish')(function* (event: WatchdogEvent) {
    yield* Effect.log('Publishing ', event._tag)
    yield* PubSub.publish(pubsub, event)
  })

  return {
    publish,
    stream: Stream.fromPubSub(pubsub),
  } satisfies Interface
})

export const layer = Layer.effect(WatchdogEvents, make)
