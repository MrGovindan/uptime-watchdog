import { Api, type Monitor, type MonitorId, MonitorNotFound } from '@uptime-watchdog/common'
import { Effect, Layer, Option } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { Mattermost } from './Mattermost'
import { MonitorRepository } from './MonitorRepository'
import type { Interface as MonitorRepositoryInterface } from './MonitorRepository'
import * as NotificationMessages from './NotificationMessages'
import { NotificationTargetRepository } from './NotificationTargetRepository'
import { ScheduleGroupLive } from './ScheduleApi'
import { WatchdogEvents } from './WatchdogEvents'

const ensureMonitor = (
  repository: MonitorRepositoryInterface,
  monitorId: MonitorId,
): Effect.Effect<Monitor, MonitorNotFound> =>
  repository.find(monitorId).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new MonitorNotFound({ monitorId })),
        onSome: (monitor) => Effect.succeed(monitor),
      }),
    ),
  )

export const MonitorGroupLive = HttpApiBuilder.group(Api, 'monitor', (handlers) =>
  Effect.gen(function* () {
    const repository = yield* MonitorRepository
    const targets = yield* NotificationTargetRepository
    const mattermost = yield* Mattermost
    const events = yield* WatchdogEvents

    return handlers
      .handle(
        'register',
        Effect.fn(function* ({ payload }) {
          const monitor = yield* repository.register(payload)
          yield* events.publish({ _tag: 'MonitorRegistered', monitor })
          return monitor
        }),
      )

      .handle('list', () => repository.list)

      .handle(
        'updateMonitor',
        Effect.fn(function* ({ params, payload }) {
          const updated = yield* repository.update(params.monitorId, payload)

          return yield* Option.match(updated, {
            onNone: () => Effect.fail(new MonitorNotFound({ monitorId: params.monitorId })),
            onSome: (monitor) =>
              events.publish({ _tag: 'MonitorUpdated', monitor }).pipe(Effect.as(monitor)),
          })
        }),
      )

      .handle(
        'deleteMonitor',
        Effect.fn(function* ({ params }) {
          const monitor = yield* ensureMonitor(repository, params.monitorId)
          const notificationTargets = yield* targets.list(monitor.id)
          yield* repository.delete(monitor.id)
          yield* events.publish({ _tag: 'MonitorDeleted', monitor, targets: notificationTargets })
        }),
      )

      .handle('listNotificationTargets', ({ params }) =>
        ensureMonitor(repository, params.monitorId).pipe(
          Effect.flatMap(() => targets.list(params.monitorId)),
        ),
      )

      .handle(
        'addNotificationTarget',
        Effect.fn(function* ({ params, payload }) {
          const monitor = yield* ensureMonitor(repository, params.monitorId)
          const user = yield* mattermost.getUser(payload.mattermostUserId)
          const target = yield* targets.add(monitor.id, user)
          yield* events.publish({ _tag: 'NotificationTargetAdded', monitor, target })
          return target
        }),
      )

      .handle(
        'removeNotificationTarget',
        Effect.fn(function* ({ params }) {
          const monitor = yield* ensureMonitor(repository, params.monitorId)
          const removedTarget = yield* targets.remove(monitor.id, params.mattermostUserId)
          yield* Option.match(removedTarget, {
            onNone: () => Effect.void,
            onSome: (target) =>
              events.publish({ _tag: 'NotificationTargetRemoved', monitor, target }),
          })
        }),
      )
  }),
)

export const NotificationGroupLive = HttpApiBuilder.group(Api, 'notification', (handlers) =>
  Effect.gen(function* () {
    const mattermost = yield* Mattermost

    return handlers
      .handle('searchMattermostUsers', ({ payload }) => mattermost.searchUsers(payload.term))
      .handle('sendMattermostTest', ({ payload }) =>
        mattermost.sendDirectMessage(
          payload.mattermostUserId,
          NotificationMessages.testForMonitor(),
        ),
      )
  }),
)

export const layer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(MonitorGroupLive),
  Layer.provide(NotificationGroupLive),
  Layer.provide(ScheduleGroupLive),
)
