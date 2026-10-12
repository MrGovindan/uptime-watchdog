import {
  MattermostUnavailable,
  MattermostUserNotFound,
  type MattermostUserId,
  type Monitor,
  type MonitorDefinition,
  MonitorNotFound,
  type MonitorId,
  NotificationTargetAlreadyExists,
  NotificationTargetNotFound,
  type NotificationTarget,
  type NotificationTargetDefinition,
  type NotificationWindow,
  type NotificationWindowDefinition,
  NotificationWindow as NotificationWindowSchema,
  resolveNotificationWindow,
} from '@uptime-watchdog/common'
import { Context, Effect, Layer, Option, Schema } from 'effect'
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
    definition: NotificationTargetDefinition,
  ) => Effect.Effect<
    NotificationTarget,
    MonitorNotFound | NotificationTargetAlreadyExists | MattermostUserNotFound | MattermostUnavailable
  >
  readonly updateTargetWindow: (
    monitorId: MonitorId,
    mattermostUserId: MattermostUserId,
    window: NotificationWindowDefinition | null,
  ) => Effect.Effect<NotificationTarget, MonitorNotFound | NotificationTargetNotFound>
  readonly removeTarget: (
    monitorId: MonitorId,
    mattermostUserId: MattermostUserId,
  ) => Effect.Effect<void, MonitorNotFound>
}

export class MonitorDirectory extends Context.Service<MonitorDirectory, Interface>()('MonitorDirectory') {}

const make = (defaultTimezone: string) =>
  Effect.gen(function* () {
    const repository = yield* MonitorRepository
    const targets = yield* NotificationTargetRepository
    const mattermost = yield* Mattermost
    const events = yield* WatchdogEvents

    const resolveWindow = (definition: NotificationWindowDefinition): Effect.Effect<NotificationWindow> =>
      Schema.decodeUnknownEffect(NotificationWindowSchema)(resolveNotificationWindow(definition, defaultTimezone)).pipe(
        Effect.orDie,
      )

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

    const update = Effect.fn('MonitorDirectory.update')(function* (
      monitorId: MonitorId,
      definition: MonitorDefinition,
    ) {
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
      definition: NotificationTargetDefinition,
    ) {
      const monitor = yield* find(monitorId)
      const user = yield* mattermost.getUser(definition.mattermostUserId)
      const window = definition.window === undefined ? null : yield* resolveWindow(definition.window)
      const target = yield* targets.add(monitor.id, user, window)
      yield* events.publish({ _tag: 'NotificationTargetAdded', monitor, target })
      return target
    })

    const updateTargetWindow = Effect.fn('MonitorDirectory.updateTargetWindow')(function* (
      monitorId: MonitorId,
      mattermostUserId: MattermostUserId,
      windowDefinition: NotificationWindowDefinition | null,
    ) {
      const monitor = yield* find(monitorId)
      const window = windowDefinition === null ? null : yield* resolveWindow(windowDefinition)
      const updated = yield* targets.setWindow(monitor.id, mattermostUserId, window)

      return yield* Option.match(updated, {
        onNone: () => Effect.fail(new NotificationTargetNotFound({ monitorId, mattermostUserId })),
        onSome: (target) => Effect.succeed(target),
      })
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
      updateTargetWindow,
      removeTarget,
    } satisfies Interface
  })

export const layer = (defaultTimezone: string) => Layer.effect(MonitorDirectory, make(defaultTimezone))
