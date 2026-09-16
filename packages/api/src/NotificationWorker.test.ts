import { BunHttpServer } from '@effect/platform-bun'
import {
  Api,
  type MattermostUser,
  MattermostUnavailable,
  MattermostUserNotFound,
  MonitorDefinition,
  type MonitorId,
} from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Option, Queue, Schema } from 'effect'
import { HttpApiTest } from 'effect/unstable/httpapi'
import * as Database from './Database'
import { Mattermost } from './Mattermost'
import type { Interface as MattermostInterface } from './Mattermost'
import * as MonitorApi from './MonitorApi'
import { layer as monitorRepositoryLayer } from './MonitorRepository'
import { MonitorHealth } from './MonitorHealth'
import * as NotificationMessages from './NotificationMessages'
import { layer as notificationTargetRepositoryLayer } from './NotificationTargetRepository'
import * as NotificationWorker from './NotificationWorker'
import * as WatchdogEvents from './WatchdogEvents'

type SentMessage = Readonly<{ userId: string; message: string }>

const mattermostUser: MattermostUser = {
  id: 'mm-jesse',
  username: 'jesse',
  displayName: 'Jesse Duffield',
}

const definition = Effect.runSync(
  Schema.decodeUnknownEffect(MonitorDefinition)({
    name: 'Prod API',
    request: {
      hostname: 'example.test',
      port: 8080,
      protocol: 'https',
      method: 'GET',
      headers: {},
    },
    cronSchedule: '*/5 * * * *',
    expectedStatus: 200,
  }),
)

const openClient = HttpApiTest.groups(Api, ['monitor', 'notification'])

const dependencies = Layer.provideMerge(BunHttpServer.layerHttpServices)

const MonitorHealthAbsent = Layer.succeed(MonitorHealth, {
  getHealth: () => Effect.succeed(Option.none()),
})

const makeLayers = (overrides: Partial<MattermostInterface> = {}) => {
  const messages = Effect.runSync(Queue.unbounded<SentMessage>())
  const database = Database.layer(':memory:')
  const events = WatchdogEvents.layer
  const monitors = monitorRepositoryLayer.pipe(Layer.provide(database))
  const targets = notificationTargetRepositoryLayer.pipe(Layer.provide(database))
  const mattermost = Layer.succeed(Mattermost, {
    searchUsers: () => Effect.succeed([mattermostUser]),
    getUser: (userId) =>
      userId === mattermostUser.id
        ? Effect.succeed(mattermostUser)
        : Effect.fail(new MattermostUserNotFound({ mattermostUserId: userId })),
    sendDirectMessage: (userId, message) =>
      Queue.offer(messages, { userId, message }).pipe(Effect.asVoid),
    ...overrides,
  })

  const groups = Layer.mergeAll(MonitorApi.MonitorGroupLive, MonitorApi.NotificationGroupLive).pipe(
    Layer.provide(events),
    Layer.provide(monitors),
    Layer.provide(targets),
    Layer.provide(mattermost),
    Layer.provide(MonitorHealthAbsent),
    dependencies,
  )
  const worker = NotificationWorker.layer.pipe(Layer.provide(events), Layer.provide(mattermost))

  return { layer: Layer.merge(groups, worker), messages }
}

const addTarget = (monitorId: MonitorId) =>
  Effect.gen(function* () {
    const { monitor } = yield* openClient
    yield* monitor.addNotificationTarget({
      params: { monitorId },
      payload: { mattermostUserId: mattermostUser.id },
    })
  })

describe('NotificationWorker', () => {
  it.effect('notifies a user when they are added as a notification target', () => {
    const { layer, messages } = makeLayers()

    return Effect.gen(function* () {
      const { monitor } = yield* openClient
      const created = yield* monitor.register({ payload: definition })

      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)

      yield* monitor.addNotificationTarget({
        params: { monitorId: created.id },
        payload: { mattermostUserId: mattermostUser.id },
      })

      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.addedToMonitor('Prod API'),
      })
    }).pipe(Effect.provide(layer))
  })

  it.effect('notifies a user only when a removal actually deletes a target', () => {
    const { layer, messages } = makeLayers()

    return Effect.gen(function* () {
      const { monitor } = yield* openClient
      const created = yield* monitor.register({ payload: definition })
      yield* addTarget(created.id)
      yield* Queue.take(messages)

      yield* monitor.removeNotificationTarget({
        params: { monitorId: created.id, mattermostUserId: mattermostUser.id },
      })
      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.removedFromMonitor('Prod API'),
      })

      yield* monitor.removeNotificationTarget({
        params: { monitorId: created.id, mattermostUserId: mattermostUser.id },
      })
      yield* Effect.yieldNow

      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)
    }).pipe(Effect.provide(layer))
  })

  it.effect('notifies every target when the monitor is deleted', () => {
    const { layer, messages } = makeLayers()

    return Effect.gen(function* () {
      const { monitor } = yield* openClient
      const created = yield* monitor.register({ payload: definition })
      yield* addTarget(created.id)
      yield* Queue.take(messages)

      yield* monitor.deleteMonitor({ params: { monitorId: created.id } })

      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.monitorDeleted('Prod API'),
      })
    }).pipe(Effect.provide(layer))
  })

  it.live('retries a failed delivery before succeeding', () => {
    let attempts = 0
    const { layer, messages } = makeLayers({
      sendDirectMessage: (userId, message) =>
        Effect.suspend(() => {
          attempts += 1
          return attempts === 1
            ? Effect.fail(new MattermostUnavailable({ message: 'down' }))
            : Queue.offer(messages, { userId, message }).pipe(Effect.asVoid)
        }),
    })

    return Effect.gen(function* () {
      const { monitor } = yield* openClient
      const created = yield* monitor.register({ payload: definition })
      yield* addTarget(created.id)

      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.addedToMonitor('Prod API'),
      })
      expect(attempts).toBe(2)
    }).pipe(Effect.provide(layer))
  })
})
