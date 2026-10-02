import { Api, toMonitorHealth } from '@uptime-watchdog/common'
import { Effect, Layer } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { Mattermost } from './Mattermost'
import { MonitorDirectory } from './MonitorDirectory'
import { MonitorRepository } from './MonitorRepository'
import { MonitorHealth } from './MonitorHealth'
import { MonitorStreams } from './MonitorStreams'
import * as NotificationMessages from './NotificationMessages'
import { ScheduleGroupLive } from './ScheduleApi'

export const MonitorGroupLive = HttpApiBuilder.group(Api, 'monitor', (handlers) =>
  Effect.gen(function* () {
    const repository = yield* MonitorRepository
    const directory = yield* MonitorDirectory
    const health = yield* MonitorHealth
    const streams = yield* MonitorStreams

    return handlers
      .handle('register', ({ payload }) => directory.register(payload))

      .handle('list', () =>
        repository.list.pipe(
          Effect.map((monitors) =>
            monitors.map((monitor) => Effect.map(health.getHealth(monitor.id), (health) => ({ monitor, health }))),
          ),
          Effect.flatMap(Effect.all),
        ),
      )

      .handle('updateMonitor', ({ params, payload }) => directory.update(params.monitorId, payload))

      .handle('deleteMonitor', ({ params }) => directory.delete(params.monitorId))

      .handle(
        'checkMonitor',
        Effect.fn(function* ({ params }) {
          const monitor = yield* directory.find(params.monitorId)
          const observation = yield* streams.checkNow(monitor)
          return toMonitorHealth(observation, monitor.expectedStatus)
        }),
      )

      .handle('listNotificationTargets', ({ params }) => directory.listTargets(params.monitorId))

      .handle('addNotificationTarget', ({ params, payload }) =>
        directory.addTarget(params.monitorId, payload.mattermostUserId),
      )

      .handle('removeNotificationTarget', ({ params }) =>
        directory.removeTarget(params.monitorId, params.mattermostUserId),
      )
  }),
)

export const NotificationGroupLive = HttpApiBuilder.group(Api, 'notification', (handlers) =>
  Effect.gen(function* () {
    const mattermost = yield* Mattermost

    return handlers
      .handle('searchMattermostUsers', ({ payload }) => mattermost.searchUsers(payload.term))
      .handle('sendMattermostTest', ({ payload }) =>
        mattermost.sendDirectMessage(payload.mattermostUserId, NotificationMessages.testForMonitor()),
      )
  }),
)

export const layer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(MonitorGroupLive),
  Layer.provide(NotificationGroupLive),
  Layer.provide(ScheduleGroupLive),
)
