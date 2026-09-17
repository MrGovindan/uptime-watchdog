import type { MonitorObservation, MattermostUser } from '@uptime-watchdog/common'
import { MattermostUserNotFound } from '@uptime-watchdog/common'
import { BunHttpServer } from '@effect/platform-bun'
import { Cron, Effect, Layer, Queue, Stream } from 'effect'

import { CronConversion, type Interface as CronConversionInterface } from './CronConversion'
import * as Database from './Database'
import { Mattermost, type Interface as MattermostInterface } from './Mattermost'
import { layer as monitorHealthLayer } from './MonitorHealth'
import { layer as monitorRepositoryLayer } from './MonitorRepository'
import * as MonitorStreams from './MonitorStreams'
import { layer as notificationTargetRepositoryLayer } from './NotificationTargetRepository'
import * as WatchdogEvents from './WatchdogEvents'

export const definitionJson = {
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
}

export const dependencies = Layer.provideMerge(BunHttpServer.layerHttpServices)

export const cronConversionStub = (
  overrides: Partial<CronConversionInterface> = {},
): Layer.Layer<CronConversion> => {
  const cron = Cron.parseUnsafe('*/5 * * * *', 'UTC')
  const base: CronConversionInterface = {
    convert: () => Effect.succeed({ cron }),
  }
  return Layer.succeed(CronConversion, { ...base, ...overrides })
}

export const mattermostUser: MattermostUser = {
  id: 'mm-jesse',
  username: 'jesse',
  displayName: 'Jesse Duffield',
}

export const botUser: MattermostUser = {
  id: 'mm-bot',
  username: 'watchdog',
  displayName: 'Watchdog',
}

export const mattermostStub = (
  overrides: Partial<MattermostInterface> = {},
): Layer.Layer<Mattermost> => {
  const users = new Map([[mattermostUser.id, mattermostUser]])

  const base: MattermostInterface = {
    searchUsers: () => Effect.succeed([mattermostUser]),
    getUser: (userId) => {
      const user = users.get(userId)
      return user === undefined
        ? Effect.fail(new MattermostUserNotFound({ mattermostUserId: userId }))
        : Effect.succeed(user)
    },
    sendDirectMessage: (userId) =>
      users.has(userId)
        ? Effect.void
        : Effect.fail(new MattermostUserNotFound({ mattermostUserId: userId })),
  }

  return Layer.succeed(Mattermost, { ...base, ...overrides })
}

export const shareDependencies = () => {
  const database = Database.layer(':memory:')
  const events = WatchdogEvents.layer
  const observationQueue = Effect.runSync(Queue.unbounded<MonitorObservation>())
  const streamsStub = Layer.succeed(MonitorStreams.MonitorStreams, {
    start: () => Effect.void,
    observations: Stream.fromQueue(observationQueue),
  })
  const health = monitorHealthLayer.pipe(Layer.provide(streamsStub), Layer.provide(events))

  return {
    events,
    monitors: monitorRepositoryLayer.pipe(Layer.provide(database)),
    targets: notificationTargetRepositoryLayer.pipe(Layer.provide(database)),
    health,
    observationQueue,
  }
}

export const waitFor = <A>(
  effect: Effect.Effect<A>,
  predicate: (value: A) => boolean,
  attemptsLeft = 1000,
): Effect.Effect<A> =>
  Effect.flatMap(effect, (value) =>
    predicate(value)
      ? Effect.succeed(value)
      : attemptsLeft > 0
        ? Effect.flatMap(Effect.yieldNow, () => waitFor(effect, predicate, attemptsLeft - 1))
        : Effect.die('waitFor exceeded'),
  )
