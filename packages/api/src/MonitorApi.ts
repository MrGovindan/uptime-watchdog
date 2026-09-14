import { Api, type MonitorId, MonitorNotFound, type MonitorName } from '@uptime-watchdog/common'
import { Effect, Layer, Option } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { Mattermost } from './Mattermost'
import { MonitorRepository } from './MonitorRepository'
import type { Interface as MonitorRepositoryInterface } from './MonitorRepository'
import { NotificationTargetRepository } from './NotificationTargetRepository'

const ensureMonitor = (
  repository: MonitorRepositoryInterface,
  monitorId: MonitorId,
): Effect.Effect<void, MonitorNotFound> =>
  repository.find(monitorId).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new MonitorNotFound({ monitorId })),
        onSome: () => Effect.void,
      }),
    ),
  )

const resolveMonitorName = (
  repository: MonitorRepositoryInterface,
  monitorId: MonitorId | undefined,
): Effect.Effect<Option.Option<MonitorName>, MonitorNotFound> => {
  if (monitorId === undefined) {
    return Effect.succeed(Option.none())
  }

  return repository.find(monitorId).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new MonitorNotFound({ monitorId })),
        onSome: (monitor) => Effect.succeed(Option.some(monitor.name)),
      }),
    ),
  )
}

const testMessage = (maybeMonitorName: Option.Option<MonitorName>): string =>
  Option.match(maybeMonitorName, {
    onNone: () => 'This is a test notification from Uptime Watchdog.',
    onSome: (monitorName) =>
      `This is a test notification from Uptime Watchdog for monitor "${monitorName}".`,
  })

export const MonitorGroupLive = HttpApiBuilder.group(Api, 'monitor', (handlers) =>
  Effect.gen(function* () {
    const repository = yield* MonitorRepository
    const targets = yield* NotificationTargetRepository
    const mattermost = yield* Mattermost

    return handlers
      .handle('register', ({ payload }) => repository.register(payload))
      .handle('list', () => repository.list)
      .handle('listNotificationTargets', ({ params }) =>
        ensureMonitor(repository, params.monitorId).pipe(
          Effect.flatMap(() => targets.list(params.monitorId)),
        ),
      )
      .handle('addNotificationTarget', ({ params, payload }) =>
        ensureMonitor(repository, params.monitorId).pipe(
          Effect.flatMap(() => mattermost.getUser(payload.mattermostUserId)),
          Effect.flatMap((user) => targets.add(params.monitorId, user)),
        ),
      )
      .handle('removeNotificationTarget', ({ params }) =>
        ensureMonitor(repository, params.monitorId).pipe(
          Effect.flatMap(() => targets.remove(params.monitorId, params.mattermostUserId)),
        ),
      )
  }),
)

export const NotificationGroupLive = HttpApiBuilder.group(Api, 'notification', (handlers) =>
  Effect.gen(function* () {
    const mattermost = yield* Mattermost
    const repository = yield* MonitorRepository

    return handlers
      .handle('searchMattermostUsers', ({ payload }) => mattermost.searchUsers(payload.term))
      .handle('sendMattermostTest', ({ payload }) =>
        resolveMonitorName(repository, payload.monitorId).pipe(
          Effect.flatMap((maybeMonitorName) =>
            mattermost.sendDirectMessage(payload.mattermostUserId, testMessage(maybeMonitorName)),
          ),
        ),
      )
  }),
)

export const layer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(MonitorGroupLive),
  Layer.provide(NotificationGroupLive),
)
