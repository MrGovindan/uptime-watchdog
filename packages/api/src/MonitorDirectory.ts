import {
  MattermostUnavailable,
  MattermostUserNotFound,
  type MattermostUserId,
  type Monitor,
  type MonitorDefinition,
  MonitorNotFound,
  type MonitorId,
  NotificationTargetAlreadyExists,
  type NotificationTarget,
} from '@uptime-watchdog/common'
import { Context, Effect, Layer, Option } from 'effect'
import { Mattermost } from './Mattermost'
import { MonitorRepository } from './MonitorRepository'
import { NotificationTargetRepository } from './NotificationTargetRepository'
import { WatchdogEvents } from './WatchdogEvents'

export interface Interface {
  readonly find: (monitorId: MonitorId) => Effect.Effect<Monitor, MonitorNotFound>
  readonly register: (definition: MonitorDefinition) => Effect.Effect<Monitor>
  readonly update: (monitorId: MonitorId, definition: MonitorDefinition) => Effect.Effect<Monitor, MonitorNotFound>
  readonly delete: (monitorId: MonitorId) => Effect.Effect<void, MonitorNotFound>
  readonly listTargets: (monitorId: MonitorId) => Effect.Effect<ReadonlyArray<NotificationTarget>, MonitorNotFound>
  readonly addTarget: (
    monitorId: MonitorId,
    mattermostUserId: MattermostUserId,
  ) => Effect.Effect<
    NotificationTarget,
    MonitorNotFound | NotificationTargetAlreadyExists | MattermostUserNotFound | MattermostUnavailable
  >
  readonly removeTarget: (
    monitorId: MonitorId,
    mattermostUserId: MattermostUserId,
  ) => Effect.Effect<void, MonitorNotFound>
}

export class MonitorDirectory extends Context.Service<MonitorDirectory, Interface>()('MonitorDirectory') {}

const make = Effect.gen(function* () {
  const repository = yield* MonitorRepository
  const targets = yield* NotificationTargetRepository
  const mattermost = yield* Mattermost
  const events = yield* WatchdogEvents

  const orNotFound =
    (monitorId: MonitorId) =>
    (monitor: Option.Option<Monitor>): Effect.Effect<Monitor, MonitorNotFound> =>
      Option.match(monitor, {
        onNone: () => Effect.fail(new MonitorNotFound({ monitorId })),
        onSome: (found) => Effect.succeed(found),
      })

  const find = (monitorId: MonitorId): Effect.Effect<Monitor, MonitorNotFound> =>
    repository.find(monitorId).pipe(Effect.flatMap(orNotFound(monitorId)))

  const register = Effect.fn('MonitorDirectory.register')(function* (definition: MonitorDefinition) {
    const monitor = yield* repository.register(definition)
    yield* events.publish({ _tag: 'MonitorRegistered', monitor })
    return monitor
  })

  const update = Effect.fn('MonitorDirectory.update')(function* (monitorId: MonitorId, definition: MonitorDefinition) {
    const monitor = yield* repository.update(monitorId, definition).pipe(Effect.flatMap(orNotFound(monitorId)))
    yield* events.publish({ _tag: 'MonitorUpdated', monitor })
    return monitor
  })

  const deleteMonitor = Effect.fn('MonitorDirectory.delete')(function* (monitorId: MonitorId) {
    const monitor = yield* find(monitorId)
    const notificationTargets = yield* targets.list(monitor.id)
    yield* repository.delete(monitor.id)
    yield* events.publish({ _tag: 'MonitorDeleted', monitor, targets: notificationTargets })
  })

  const listTargets = (monitorId: MonitorId): Effect.Effect<ReadonlyArray<NotificationTarget>, MonitorNotFound> =>
    find(monitorId).pipe(Effect.flatMap(() => targets.list(monitorId)))

  const addTarget = Effect.fn('MonitorDirectory.addTarget')(function* (
    monitorId: MonitorId,
    mattermostUserId: MattermostUserId,
  ) {
    const monitor = yield* find(monitorId)
    const user = yield* mattermost.getUser(mattermostUserId)
    const target = yield* targets.add(monitor.id, user)
    yield* events.publish({ _tag: 'NotificationTargetAdded', monitor, target })
    return target
  })

  const removeTarget = Effect.fn('MonitorDirectory.removeTarget')(function* (
    monitorId: MonitorId,
    mattermostUserId: MattermostUserId,
  ) {
    const monitor = yield* find(monitorId)
    const removedTarget = yield* targets.remove(monitor.id, mattermostUserId)
    yield* Option.match(removedTarget, {
      onNone: () => Effect.void,
      onSome: (target) => events.publish({ _tag: 'NotificationTargetRemoved', monitor, target }),
    })
  })

  return {
    find,
    register,
    update,
    delete: deleteMonitor,
    listTargets,
    addTarget,
    removeTarget,
  } satisfies Interface
})

export const layer = Layer.effect(MonitorDirectory, make)
