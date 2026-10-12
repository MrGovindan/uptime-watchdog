import {
  type MattermostUserId,
  type Monitor,
  type MonitorHealth,
  type MonitorId,
  type NotificationTarget,
  isWithinWindow,
} from '@uptime-watchdog/common'
import { Array, Context, DateTime, Duration, Effect, HashMap, Layer, Option, Ref, Schedule, Stream } from 'effect'
import { Mattermost } from './Mattermost'
import * as NotificationMessages from './NotificationMessages'
import { NotificationTargetRepository } from './NotificationTargetRepository'
import { WatchdogEvent } from '@uptime-watchdog/common'
import { WatchdogEvents } from './WatchdogEvents'

type Delivery = Readonly<{ userId: MattermostUserId; message: string }>

type PendingAlert = Readonly<{ monitor: Monitor; mattermostUserId: MattermostUserId }>

export interface Interface {
  readonly deliver: (event: WatchdogEvent) => Effect.Effect<void>
}

export class NotificationWorker extends Context.Service<NotificationWorker, Interface>()('NotificationWorker') {}

const FLUSH_INTERVAL = Duration.seconds(60)

const retrySchedule = Schedule.max([Schedule.exponential('200 millis'), Schedule.recurs(2)]).pipe(Schedule.jittered)

const targetDeliveries = (targets: ReadonlyArray<NotificationTarget>, message: string): ReadonlyArray<Delivery> =>
  Array.map(targets, (target) => ({ userId: target.mattermostUserId, message }))

const targetIsOpen = (target: NotificationTarget, at: DateTime.DateTime): boolean =>
  target.window === null || isWithinWindow(target.window, at)

const pendingKey = (monitor: Monitor, mattermostUserId: MattermostUserId): string =>
  `${monitor.id}\u0000${mattermostUserId}`

const make = Effect.gen(function* () {
  const events = yield* WatchdogEvents
  const mattermost = yield* Mattermost
  const targets = yield* NotificationTargetRepository
  const healthStates = yield* Ref.make(HashMap.empty<MonitorId, MonitorHealth['_tag']>())
  const pendingAlerts = yield* Ref.make(HashMap.empty<string, PendingAlert>())

  const sendOne = (delivery: Delivery): Effect.Effect<void> =>
    mattermost.sendDirectMessage(delivery.userId, delivery.message).pipe(
      Effect.retry(retrySchedule),
      Effect.catchCause((cause) => Effect.logWarning(cause)),
    )

  const sendDeliveries = (deliveries: ReadonlyArray<Delivery>): Effect.Effect<void> =>
    Effect.forEach(deliveries, sendOne, { discard: true })

  // Health events are snapshots published on every check; a notification is only
  // warranted when the tag differs from the previous observation.
  const recordHealth = (monitor: Monitor, tag: MonitorHealth['_tag']) =>
    Ref.modify(healthStates, (current) => [HashMap.get(current, monitor.id), HashMap.set(current, monitor.id, tag)])

  const planHealth = Effect.fn('NotificationWorker.planHealth')(function* (monitor: Monitor, message: string) {
    const now = yield* DateTime.now
    const all = yield* targets.list(monitor.id)
    const open = Array.filter(all, (target) => targetIsOpen(target, now))
    const closed = Array.filter(all, (target) => !targetIsOpen(target, now))
    return { open: targetDeliveries(open, message), closed }
  })

  const setPending = (monitor: Monitor, closed: ReadonlyArray<NotificationTarget>): Effect.Effect<void> =>
    Ref.update(pendingAlerts, (current) =>
      Array.reduce(closed, current, (map, target) =>
        HashMap.set(map, pendingKey(monitor, target.mattermostUserId), {
          monitor,
          mattermostUserId: target.mattermostUserId,
        }),
      ),
    )

  const clearPendingForMonitor = (monitorId: MonitorId): Effect.Effect<void> =>
    Ref.update(pendingAlerts, (current) => HashMap.filter(current, (entry) => entry.monitor.id !== monitorId))

  const deliveries = (event: WatchdogEvent): Effect.Effect<ReadonlyArray<Delivery>> =>
    WatchdogEvent.match(event, {
      MonitorRegistered: () => Effect.succeed([]),
      MonitorUpdated: () => Effect.succeed([]),
      MonitorDeleted: ({ monitor, targets }) =>
        clearPendingForMonitor(monitor.id).pipe(
          Effect.andThen(Ref.update(healthStates, (current) => HashMap.remove(current, monitor.id))),
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
              ? Effect.gen(function* () {
                  const now = yield* DateTime.now
                  const pendingBefore = yield* Ref.get(pendingAlerts)
                  const all = yield* targets.list(monitor.id)
                  // A target whose degraded alert was suppressed should not learn
                  // about the heal it was never told about.
                  const wasSuppressed = (target: NotificationTarget) =>
                    HashMap.has(pendingBefore, pendingKey(monitor, target.mattermostUserId))
                  const open = Array.filter(all, (target) => !wasSuppressed(target) && targetIsOpen(target, now))
                  yield* clearPendingForMonitor(monitor.id)
                  return targetDeliveries(open, NotificationMessages.monitorHealed(monitor.name))
                })
              : Effect.succeed([]),
          ),
        ),
      MonitorDegraded: ({ monitor }) =>
        recordHealth(monitor, 'Degraded').pipe(
          Effect.flatMap((previous) =>
            Option.exists(previous, (tag) => tag === 'Degraded')
              ? Effect.succeed([])
              : planHealth(monitor, NotificationMessages.monitorDegraded(monitor.name)).pipe(
                  Effect.flatMap(({ open, closed }) => setPending(monitor, closed).pipe(Effect.as(open))),
                ),
          ),
        ),
    })

  const deliver = (event: WatchdogEvent): Effect.Effect<void> =>
    deliveries(event).pipe(
      Effect.catchCause((cause) => Effect.logWarning(cause).pipe(Effect.as([]))),
      Effect.flatMap(sendDeliveries),
    )

  // Re-evaluates suppressed alerts so a target that is still degraded when its
  // window opens receives the alert it missed.
  const flushPending = Effect.gen(function* () {
    const now = yield* DateTime.now
    const pending = yield* Ref.get(pendingAlerts)
    const health = yield* Ref.get(healthStates)
    const toSend: Array<Delivery> = []
    let remaining = HashMap.empty<string, PendingAlert>()

    for (const [key, entry] of HashMap.toEntries(pending)) {
      const degraded = Option.exists(HashMap.get(health, entry.monitor.id), (tag) => tag === 'Degraded')
      if (!degraded) {
        continue
      }

      const currentTargets = yield* targets.list(entry.monitor.id)
      const target = Array.findFirst(
        currentTargets,
        (candidate) => candidate.mattermostUserId === entry.mattermostUserId,
      )
      if (Option.isNone(target)) {
        continue
      }

      if (targetIsOpen(target.value, now)) {
        toSend.push({
          userId: entry.mattermostUserId,
          message: NotificationMessages.monitorDegraded(entry.monitor.name),
        })
        continue
      }

      remaining = HashMap.set(remaining, key, entry)
    }

    yield* Ref.set(pendingAlerts, remaining)
    yield* sendDeliveries(toSend)
  })

  yield* events.stream.pipe(Stream.runForEach(deliver), Effect.forkScoped)
  yield* Stream.tick(FLUSH_INTERVAL).pipe(
    Stream.runForEach(() => flushPending),
    Effect.forkScoped,
  )

  // Give the forked subscriptions a chance to start before the layer is
  // considered acquired, so events published immediately afterwards are seen.
  yield* Effect.yieldNow

  return { deliver } satisfies Interface
})

export const layer = Layer.effect(NotificationWorker, make)
