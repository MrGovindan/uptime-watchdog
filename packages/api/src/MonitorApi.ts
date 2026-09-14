import { Api, type Monitor, type MonitorId, MonitorNotFound } from '@uptime-watchdog/common'
import { Effect, Layer, Option } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { Mattermost } from './Mattermost'
import { MonitorRepository } from './MonitorRepository'
import type { Interface as MonitorRepositoryInterface } from './MonitorRepository'
import * as NotificationMessages from './NotificationMessages'
import { NotificationTargetRepository } from './NotificationTargetRepository'
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
      .handle('register', ({ payload }) => repository.register(payload))
      .handle('list', () => repository.list)
      .handle('deleteMonitor', ({ params }) =>
        ensureMonitor(repository, params.monitorId).pipe(
          Effect.flatMap((monitor) =>
            targets
              .list(params.monitorId)
              .pipe(
                Effect.flatMap((snapshot) =>
                  repository
                    .delete(params.monitorId)
                    .pipe(
                      Effect.flatMap(() =>
                        events.publish({ _tag: 'MonitorDeleted', monitor, targets: snapshot }),
                      ),
                    ),
                ),
              ),
          ),
        ),
      )
      .handle('listNotificationTargets', ({ params }) =>
        ensureMonitor(repository, params.monitorId).pipe(
          Effect.flatMap(() => targets.list(params.monitorId)),
        ),
      )
      .handle('addNotificationTarget', ({ params, payload }) =>
        ensureMonitor(repository, params.monitorId).pipe(
          Effect.flatMap((monitor) =>
            mattermost
              .getUser(payload.mattermostUserId)
              .pipe(Effect.flatMap((user) => targets.add(params.monitorId, user)))
              .pipe(
                Effect.flatMap((target) =>
                  events
                    .publish({ _tag: 'NotificationTargetAdded', monitor, target })
                    .pipe(Effect.as(target)),
                ),
              ),
          ),
        ),
      )
      .handle('removeNotificationTarget', ({ params }) =>
        ensureMonitor(repository, params.monitorId).pipe(
          Effect.flatMap((monitor) =>
            targets.remove(params.monitorId, params.mattermostUserId).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => Effect.void,
                  onSome: (target) =>
                    events.publish({ _tag: 'NotificationTargetRemoved', monitor, target }),
                }),
              ),
            ),
          ),
        ),
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
)
