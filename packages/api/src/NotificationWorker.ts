import {
  type MattermostUserId,
  type Monitor,
  type MonitorHealth,
  type MonitorId,
  type NotificationTarget,
} from '@uptime-watchdog/common'
import { Array, Context, Effect, HashMap, Layer, Option, Ref, Schedule, Stream } from 'effect'
import { Mattermost } from './Mattermost'
import * as NotificationMessages from './NotificationMessages'
import { NotificationTargetRepository } from './NotificationTargetRepository'
import { WatchdogEvent } from '@uptime-watchdog/common'
import { WatchdogEvents } from './WatchdogEvents'

type Delivery = Readonly<{ userId: MattermostUserId; message: string }>

export interface Interface {
  readonly deliver: (event: WatchdogEvent) => Effect.Effect<void>
}

export class NotificationWorker extends Context.Service<NotificationWorker, Interface>()(
  'NotificationWorker',
) {}

const retrySchedule = Schedule.max([Schedule.exponential('200 millis'), Schedule.recurs(2)]).pipe(
  Schedule.jittered,
)

const targetDeliveries = (
  targets: ReadonlyArray<NotificationTarget>,
  message: string,
): ReadonlyArray<Delivery> =>
  Array.map(targets, (target) => ({ userId: target.mattermostUserId, message }))

const make = Effect.gen(function* () {
  const events = yield* WatchdogEvents
  const mattermost = yield* Mattermost
  const targets = yield* NotificationTargetRepository
  const healthStates = yield* Ref.make(HashMap.empty<MonitorId, MonitorHealth['_tag']>())

  const notifyTargets = (monitor: Monitor, message: string) =>
    targets
      .list(monitor.id)
      .pipe(Effect.map((healthTargets) => targetDeliveries(healthTargets, message)))

  // Health events are snapshots published on every check; a notification is only
  // warranted when the tag differs from the previous observation.
  const recordHealth = (monitor: Monitor, tag: MonitorHealth['_tag']) =>
    Ref.modify(healthStates, (current) => [
      HashMap.get(current, monitor.id),
      HashMap.set(current, monitor.id, tag),
    ])

  const deliveries = (event: WatchdogEvent): Effect.Effect<ReadonlyArray<Delivery>> =>
    WatchdogEvent.match(event, {
      MonitorRegistered: () => Effect.succeed([]),
      MonitorUpdated: () => Effect.succeed([]),
      MonitorDeleted: ({ monitor, targets }) =>
        Ref.update(healthStates, (current) => HashMap.remove(current, monitor.id)).pipe(
          Effect.as(targetDeliveries(targets, NotificationMessages.monitorDeleted(monitor.name))),
        ),
      NotificationTargetAdded: ({ monitor, target }) =>
        Effect.succeed([
          {
            userId: target.mattermostUserId,
            message: NotificationMessages.addedToMonitor(monitor.name),
          },
        ]),
      NotificationTargetRemoved: ({ monitor, target }) =>
        Effect.succeed([
          {
            userId: target.mattermostUserId,
            message: NotificationMessages.removedFromMonitor(monitor.name),
          },
        ]),
      MonitorHealthy: ({ monitor }) =>
        recordHealth(monitor, 'Healthy').pipe(
          Effect.flatMap((previous) =>
            Option.exists(previous, (tag) => tag === 'Degraded')
              ? notifyTargets(monitor, NotificationMessages.monitorHealed(monitor.name))
              : Effect.succeed([]),
          ),
        ),
      MonitorDegraded: ({ monitor }) =>
        recordHealth(monitor, 'Degraded').pipe(
          Effect.flatMap((previous) =>
            Option.exists(previous, (tag) => tag === 'Degraded')
              ? Effect.succeed([])
              : notifyTargets(monitor, NotificationMessages.monitorDegraded(monitor.name)),
          ),
        ),
    })

  const deliver = (event: WatchdogEvent): Effect.Effect<void> =>
    deliveries(event).pipe(
      Effect.catchCause((cause) => Effect.logWarning(cause).pipe(Effect.as([]))),
      Effect.flatMap((deliveriesForEvent) =>
        Effect.forEach(
          deliveriesForEvent,
          (delivery) =>
            mattermost.sendDirectMessage(delivery.userId, delivery.message).pipe(
              Effect.retry(retrySchedule),
              Effect.catchCause((cause) => Effect.logWarning(cause)),
            ),
          { discard: true },
        ),
      ),
    )

  yield* events.stream.pipe(Stream.runForEach(deliver), Effect.forkScoped)

  // Give the forked subscription a chance to start before the layer is
  // considered acquired, so events published immediately afterwards are seen.
  yield* Effect.yieldNow

  return { deliver } satisfies Interface
})

export const layer = Layer.effect(NotificationWorker, make)
