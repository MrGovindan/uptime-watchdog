import {
  type MattermostUser,
  MattermostUnavailable,
  MonitorDefinition,
  type MonitorId,
  type NotificationWindowDefinition,
} from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { DateTime, Duration, Effect, Option, Queue, Ref, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import type { Interface as MattermostInterface } from './Mattermost'
import * as NotificationMessages from './NotificationMessages'
import { observation, openClient, watchdogLayer, type TestSeams } from './testing'

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

const makeLayers = (overrides: Partial<MattermostInterface> = {}, seams: TestSeams = {}) => {
  const messages = Effect.runSync(Queue.unbounded<SentMessage>())
  const status = Effect.runSync(Ref.make(200))

  const layer = watchdogLayer({
    ...seams,
    checkUptime: () => Ref.get(status).pipe(Effect.map(observation)),
    mattermost: {
      sendDirectMessage: (userId, message) => Queue.offer(messages, { userId, message }).pipe(Effect.asVoid),
      ...overrides,
    },
  })

  return { layer, messages, status }
}

type Client = Effect.Success<ReturnType<typeof openClient>>

const addTarget = (client: Client, monitorId: MonitorId) =>
  client.monitor.addNotificationTarget({
    params: { monitorId },
    payload: { mattermostUserId: mattermostUser.id },
  })

const addTargetWithWindow = (client: Client, monitorId: MonitorId, window: NotificationWindowDefinition) =>
  client.monitor.addNotificationTarget({
    params: { monitorId },
    payload: { mattermostUserId: mattermostUser.id, window },
  })

const at = (iso: string) => DateTime.toEpochMillis(DateTime.makeUnsafe(iso))

const businessHours: NotificationWindowDefinition = {
  timezone: 'UTC',
  days: ['Monday', 'Tuesday'],
  startTime: '09:00',
  endTime: '17:00',
}

const registerWithTarget = (client: Client, messages: Queue.Queue<SentMessage>) =>
  Effect.gen(function* () {
    const created = yield* client.monitor.register({ payload: definition })
    yield* addTarget(client, created.id)
    yield* Queue.take(messages)
    return created
  })

describe('NotificationWorker', () => {
  it.effect('notifies a user when they are added as a notification target', () => {
    const { layer, messages } = makeLayers()

    return Effect.gen(function* () {
      const client = yield* openClient(layer)
      const created = yield* client.monitor.register({ payload: definition })

      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)

      yield* addTarget(client, created.id)

      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.addedToMonitor('Prod API'),
      })
    })
  })

  it.effect('notifies a user only when a removal actually deletes a target', () => {
    const { layer, messages } = makeLayers()

    return Effect.gen(function* () {
      const client = yield* openClient(layer)
      const created = yield* client.monitor.register({ payload: definition })
      yield* addTarget(client, created.id)
      yield* Queue.take(messages)

      yield* client.monitor.removeNotificationTarget({
        params: { monitorId: created.id, mattermostUserId: mattermostUser.id },
      })
      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.removedFromMonitor('Prod API'),
      })

      yield* client.monitor.removeNotificationTarget({
        params: { monitorId: created.id, mattermostUserId: mattermostUser.id },
      })
      yield* Effect.yieldNow

      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)
    })
  })

  it.effect('notifies every target when the monitor is deleted', () => {
    const { layer, messages } = makeLayers()

    return Effect.gen(function* () {
      const client = yield* openClient(layer)
      const created = yield* client.monitor.register({ payload: definition })
      yield* addTarget(client, created.id)
      yield* Queue.take(messages)

      yield* client.monitor.deleteMonitor({ params: { monitorId: created.id } })

      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.monitorDeleted('Prod API'),
      })
    })
  })

  it.effect('notifies targets when a monitor becomes degraded', () => {
    const { layer, messages, status } = makeLayers()

    return Effect.gen(function* () {
      const client = yield* openClient(layer)
      const created = yield* registerWithTarget(client, messages)

      yield* Ref.set(status, 503)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })

      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.monitorDegraded('Prod API'),
      })
      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)
    })
  })

  it.effect('notifies only on health transitions, not on every snapshot', () => {
    const { layer, messages, status } = makeLayers()

    return Effect.gen(function* () {
      const client = yield* openClient(layer)
      const created = yield* registerWithTarget(client, messages)

      yield* Ref.set(status, 200)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      yield* Effect.yieldNow
      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)

      yield* Ref.set(status, 503)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.monitorDegraded('Prod API'),
      })

      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      yield* Effect.yieldNow
      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)

      yield* Ref.set(status, 200)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.monitorHealed('Prod API'),
      })

      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      yield* Effect.yieldNow
      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)
    })
  })

  it.effect('sends nothing for degradation when the monitor has no targets', () => {
    const { layer, messages, status } = makeLayers()

    return Effect.gen(function* () {
      yield* Ref.set(status, 503)
      const client = yield* openClient(layer)
      yield* client.monitor.register({ payload: definition })
      yield* Effect.yieldNow

      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)
    })
  })

  it.effect('delivers a health alert immediately when the target is within its window', () => {
    const { layer, messages, status } = makeLayers()

    return Effect.gen(function* () {
      yield* TestClock.setTime(at('2026-01-05T14:00:00Z'))

      const client = yield* openClient(layer)
      const created = yield* client.monitor.register({ payload: definition })
      yield* addTargetWithWindow(client, created.id, businessHours)
      yield* Queue.take(messages)

      yield* Ref.set(status, 503)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })

      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.monitorDegraded('Prod API'),
      })
    })
  })

  it.effect('suppresses an out-of-window alert and delivers it once the window opens', () => {
    const { layer, messages, status } = makeLayers()

    return Effect.gen(function* () {
      yield* TestClock.setTime(at('2026-01-05T18:00:00Z'))

      const client = yield* openClient(layer)
      const created = yield* client.monitor.register({ payload: definition })
      yield* addTargetWithWindow(client, created.id, businessHours)
      yield* Queue.take(messages)

      yield* Ref.set(status, 503)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      yield* Effect.yieldNow

      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)

      yield* TestClock.setTime(at('2026-01-06T09:00:00Z'))
      yield* TestClock.adjust(Duration.minutes(1))

      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.monitorDegraded('Prod API'),
      })
    })
  })

  it.effect('stays quiet when the monitor heals before the window opens', () => {
    const { layer, messages, status } = makeLayers()

    return Effect.gen(function* () {
      yield* TestClock.setTime(at('2026-01-05T18:00:00Z'))

      const client = yield* openClient(layer)
      const created = yield* client.monitor.register({ payload: definition })
      yield* addTargetWithWindow(client, created.id, businessHours)
      yield* Queue.take(messages)

      yield* Ref.set(status, 503)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      yield* Ref.set(status, 200)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      yield* Effect.yieldNow

      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)

      yield* TestClock.setTime(at('2026-01-06T09:00:00Z'))
      yield* TestClock.adjust(Duration.minutes(1))

      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)
    })
  })

  it.effect('does not announce a heal for an alert that was suppressed outside the window', () => {
    const { layer, messages, status } = makeLayers()

    return Effect.gen(function* () {
      yield* TestClock.setTime(at('2026-01-05T08:59:50Z'))

      const quietDefinition = yield* Schema.decodeUnknownEffect(MonitorDefinition)({
        name: 'Prod API',
        request: { hostname: 'example.test', port: 8080, protocol: 'https', method: 'GET', headers: {} },
        cronSchedule: '0 0 1 1 *',
        expectedStatus: 200,
      })

      const client = yield* openClient(layer)
      const created = yield* client.monitor.register({ payload: quietDefinition })
      yield* addTargetWithWindow(client, created.id, businessHours)
      yield* Queue.take(messages)

      yield* Ref.set(status, 503)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      yield* Effect.yieldNow

      // The window opens, but the 60s flush tick has not run yet.
      yield* TestClock.setTime(at('2026-01-05T09:00:10Z'))
      yield* Ref.set(status, 200)
      yield* client.monitor.checkMonitor({ params: { monitorId: created.id } })
      yield* Effect.yieldNow

      expect(Option.isNone(yield* Queue.poll(messages))).toBe(true)
    })
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
      const client = yield* openClient(layer)
      const created = yield* client.monitor.register({ payload: definition })
      yield* addTarget(client, created.id)

      expect(yield* Queue.take(messages)).toEqual({
        userId: mattermostUser.id,
        message: NotificationMessages.addedToMonitor('Prod API'),
      })
      expect(attempts).toBe(2)
    })
  })
})
