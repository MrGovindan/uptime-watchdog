import { type MattermostUserId, type NotificationTarget } from '@uptime-watchdog/common'
import { Array, Context, Effect, Layer, Schedule, Stream } from 'effect'
import { Mattermost } from './Mattermost'
import * as NotificationMessages from './NotificationMessages'
import { NotificationTargetRepository } from './NotificationTargetRepository'
import { WatchdogEvent, WatchdogEvents } from './WatchdogEvents'

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

const deliveries = (event: WatchdogEvent, healthTargets: ReadonlyArray<NotificationTarget>) =>
  WatchdogEvent.match(event, {
    MonitorRegistered: () => [],
    MonitorUpdated: () => [],
    MonitorDeleted: ({ monitor, targets }) =>
      Array.map(targets, (target) => ({
        userId: target.mattermostUserId,
        message: NotificationMessages.monitorDeleted(monitor.name),
      })),
    NotificationTargetAdded: ({ monitor, target }) => [
      {
        userId: target.mattermostUserId,
        message: NotificationMessages.addedToMonitor(monitor.name),
      },
    ],
    NotificationTargetRemoved: ({ monitor, target }) => [
      {
        userId: target.mattermostUserId,
        message: NotificationMessages.removedFromMonitor(monitor.name),
      },
    ],
    MonitorHealthy: () => [],
    MonitorDegraded: ({ monitor }) =>
      targetDeliveries(healthTargets, NotificationMessages.monitorDegraded(monitor.name)),
    MonitorHealed: ({ monitor }) =>
      targetDeliveries(healthTargets, NotificationMessages.monitorHealed(monitor.name)),
  })

const make = Effect.gen(function* () {
  const events = yield* WatchdogEvents
  const mattermost = yield* Mattermost
  const targets = yield* NotificationTargetRepository

  const deliver = (event: WatchdogEvent): Effect.Effect<void> =>
    (event._tag === 'MonitorDegraded' || event._tag === 'MonitorHealed'
      ? targets.list(event.monitor.id)
      : Effect.succeed([])
    ).pipe(
      Effect.flatMap((healthTargets) =>
        Effect.forEach(
          deliveries(event, healthTargets),
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
