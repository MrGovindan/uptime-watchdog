import { BunHttpServer } from '@effect/platform-bun'
import {
  Api,
  DescriptionNotConvertible,
  type MattermostUser,
  MattermostUnavailable,
  MattermostUserNotFound,
  MonitorDefinition,
  ProviderUnavailable,
  TokensExhausted,
} from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { Cron, Effect, Layer, Ref, Schema } from 'effect'
import { HttpRouter } from 'effect/unstable/http'
import { HttpApiTest } from 'effect/unstable/httpapi'
import * as Database from './Database'
import { CronConversion, type Interface as CronConversionInterface } from './CronConversion'
import { Mattermost } from './Mattermost'
import type { Interface as MattermostInterface } from './Mattermost'
import * as MonitorApi from './MonitorApi'
import { ScheduleGroupLive } from './ScheduleApi'
import { layer as monitorRepositoryLayer } from './MonitorRepository'
import { layer as notificationTargetRepositoryLayer } from './NotificationTargetRepository'
import * as WatchdogEvents from './WatchdogEvents'

const dependencies = Layer.provideMerge(BunHttpServer.layerHttpServices)

const cronConversionStub = (
  overrides: Partial<CronConversionInterface> = {},
): Layer.Layer<CronConversion> => {
  const cron = Cron.parseUnsafe('*/5 * * * *', 'UTC')
  const base: CronConversionInterface = {
    convert: () => Effect.succeed({ cron }),
  }
  return Layer.succeed(CronConversion, { ...base, ...overrides })
}

const mattermostUser: MattermostUser = {
  id: 'mm-jesse',
  username: 'jesse',
  displayName: 'Jesse Duffield',
}

const botUser: MattermostUser = {
  id: 'mm-bot',
  username: 'watchdog',
  displayName: 'Watchdog',
}

const mattermostStub = (overrides: Partial<MattermostInterface> = {}): Layer.Layer<Mattermost> => {
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

const shareDependencies = () => {
  const database = Database.layer(':memory:')
  const events = WatchdogEvents.layer

  return {
    events,
    monitors: monitorRepositoryLayer.pipe(Layer.provide(database)),
    targets: notificationTargetRepositoryLayer.pipe(Layer.provide(database)),
  }
}

const groupLayer = (overrides: Partial<MattermostInterface> = {}) => {
  const { events, monitors, targets } = shareDependencies()

  return Layer.mergeAll(
    MonitorApi.MonitorGroupLive,
    MonitorApi.NotificationGroupLive,
    ScheduleGroupLive,
  ).pipe(
    Layer.provide(events),
    Layer.provide(monitors),
    Layer.provide(targets),
    Layer.provide(mattermostStub(overrides)),
    Layer.provide(cronConversionStub()),
    dependencies,
  )
}

const applicationLayer = (
  overrides: Partial<MattermostInterface> = {},
  cronOverrides: Partial<CronConversionInterface> = {},
) => {
  const { events, monitors, targets } = shareDependencies()

  return MonitorApi.layer.pipe(
    Layer.provide(events),
    Layer.provide(monitors),
    Layer.provide(targets),
    Layer.provide(mattermostStub(overrides)),
    Layer.provide(cronConversionStub(cronOverrides)),
    dependencies,
  )
}

const openClient = HttpApiTest.groups(Api, ['monitor', 'notification', 'schedule'])

const definitionJson = {
  name: 'Prod API',
  request: {
    hostname: 'example.test',
    port: 8080,
    protocol: 'https',
    method: 'GET',
    headers: {},
  },
  cronSchedule: '*/5 * * * *',
}

const definition = Effect.runSync(Schema.decodeUnknownEffect(MonitorDefinition)(definitionJson))

const request = (
  handler: (request: Request) => Promise<Response>,
  path: string,
  init?: RequestInit,
) => Effect.promise(() => handler(new Request(`http://localhost${path}`, init)))

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

type ApplicationLayer = ReturnType<typeof applicationLayer>

const withWebHandler = (
  layer: ApplicationLayer,
  run: (handler: (request: Request) => Promise<Response>) => Effect.Effect<void>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => HttpRouter.toWebHandler(layer, { disableLogger: true })),
    ({ handler }) => run(handler),
    ({ dispose }) => Effect.promise(dispose),
  )

const registerViaHttp = (handler: (request: Request) => Promise<Response>): Effect.Effect<string> =>
  Effect.gen(function* () {
    const response = yield* request(handler, '/monitor', json(definitionJson))
    expect(response.status).toBe(201)

    const created = (yield* Effect.promise(() => response.json())) as { id: string }
    return created.id
  })

describe('monitor registration', () => {
  it.effect('registers a monitor with a generated id and defaulted headers', () =>
    Effect.gen(function* () {
      const { monitor } = yield* openClient

      const created = yield* monitor.register({ payload: definition })

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(created.name).toBe('Prod API')
      expect(created.request).toMatchObject(definition.request)
      expect(created.request.headers).toEqual({})
      expect(Cron.isCron(created.cronSchedule)).toBe(true)
      expect(Cron.format(created.cronSchedule)).toBe('0-55/5 * * * *')
    }).pipe(Effect.provide(groupLayer())),
  )

  it.effect('lists registered monitors', () =>
    Effect.gen(function* () {
      const { monitor } = yield* openClient

      const created = yield* monitor.register({ payload: definition })
      const monitors = yield* monitor.list({})

      expect(monitors).toEqual([created])
    }).pipe(Effect.provide(groupLayer())),
  )

  it.effect('rejects an invalid definition with 400', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(
          handler,
          '/monitor',
          json({
            request: { hostname: '', port: -1, protocol: 'ftp', method: 'NOPE' },
            cronSchedule: 'not a cron',
          }),
        )

        expect(response.status).toBe(400)
      }),
    ),
  )

  it.effect('rejects a definition with a missing or over-long name with 400', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const bodies = [
          {
            request: { hostname: 'example.test', port: 8080, protocol: 'https', method: 'GET' },
            cronSchedule: '*/5 * * * *',
          },
          {
            name: 'x'.repeat(129),
            request: { hostname: 'example.test', port: 8080, protocol: 'https', method: 'GET' },
            cronSchedule: '*/5 * * * *',
          },
        ]

        for (const body of bodies) {
          const response = yield* request(handler, '/monitor', json(body))

          expect(response.status).toBe(400)
        }
      }),
    ),
  )
})

describe('monitor update', () => {
  const updatedJson = {
    ...definitionJson,
    name: 'Renamed API',
    cronSchedule: '0 * * * *',
  }
  const updatedDefinition = Effect.runSync(
    Schema.decodeUnknownEffect(MonitorDefinition)(updatedJson),
  )

  it.effect('replaces the definition, preserving the id and createdAt', () =>
    Effect.gen(function* () {
      const { monitor } = yield* openClient

      const created = yield* monitor.register({ payload: definition })
      const updated = yield* monitor.updateMonitor({
        params: { monitorId: created.id },
        payload: updatedDefinition,
      })

      expect(updated.id).toBe(created.id)
      expect(updated.name).toBe('Renamed API')
      expect(Cron.format(updated.cronSchedule)).toBe('0 * * * *')
      expect(updated.createdAt).toEqual(created.createdAt)

      const monitors = yield* monitor.list({})
      expect(monitors).toEqual([updated])
    }).pipe(Effect.provide(groupLayer())),
  )

  it.effect('rejects updating an unknown monitor with 404', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(handler, '/monitor/00000000-0000-4000-8000-000000000000', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(definitionJson),
        })

        expect(response.status).toBe(404)
      }),
    ),
  )

  it.effect('rejects an invalid update with 400', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const monitorId = yield* registerViaHttp(handler)
        const response = yield* request(handler, `/monitor/${monitorId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...definitionJson, name: '' }),
        })

        expect(response.status).toBe(400)
      }),
    ),
  )
})

describe('notification targets', () => {
  it.effect('adds a target, resolving the mattermost user on the server', () =>
    Effect.gen(function* () {
      const { monitor } = yield* openClient

      const created = yield* monitor.register({ payload: definition })
      const target = yield* monitor.addNotificationTarget({
        params: { monitorId: created.id },
        payload: { mattermostUserId: mattermostUser.id },
      })

      expect(target).toMatchObject({
        monitorId: created.id,
        mattermostUserId: 'mm-jesse',
        mattermostUsername: 'jesse',
        mattermostDisplayName: 'Jesse Duffield',
      })
    }).pipe(Effect.provide(groupLayer())),
  )

  it.effect('lists the targets of a monitor', () =>
    Effect.gen(function* () {
      const { monitor } = yield* openClient

      const created = yield* monitor.register({ payload: definition })
      const target = yield* monitor.addNotificationTarget({
        params: { monitorId: created.id },
        payload: { mattermostUserId: mattermostUser.id },
      })

      const targets = yield* monitor.listNotificationTargets({ params: { monitorId: created.id } })

      expect(targets).toEqual([target])
    }).pipe(Effect.provide(groupLayer())),
  )

  it.effect('removes a target idempotently', () =>
    Effect.gen(function* () {
      const { monitor } = yield* openClient

      const created = yield* monitor.register({ payload: definition })
      yield* monitor.addNotificationTarget({
        params: { monitorId: created.id },
        payload: { mattermostUserId: mattermostUser.id },
      })

      yield* monitor.removeNotificationTarget({
        params: { monitorId: created.id, mattermostUserId: mattermostUser.id },
      })
      yield* monitor.removeNotificationTarget({
        params: { monitorId: created.id, mattermostUserId: mattermostUser.id },
      })

      const targets = yield* monitor.listNotificationTargets({ params: { monitorId: created.id } })

      expect(targets).toEqual([])
    }).pipe(Effect.provide(groupLayer())),
  )

  it.effect('rejects a duplicate target with 409', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const monitorId = yield* registerViaHttp(handler)
        const body = { mattermostUserId: mattermostUser.id }

        yield* request(handler, `/monitor/${monitorId}/notification-target`, json(body))
        const response = yield* request(
          handler,
          `/monitor/${monitorId}/notification-target`,
          json(body),
        )

        expect(response.status).toBe(409)
      }),
    ),
  )

  it.effect('rejects an unknown monitor with 404', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const unknown = '00000000-0000-4000-8000-000000000000'

        const listResponse = yield* request(handler, `/monitor/${unknown}/notification-target`)
        const addResponse = yield* request(
          handler,
          `/monitor/${unknown}/notification-target`,
          json({ mattermostUserId: mattermostUser.id }),
        )

        expect(listResponse.status).toBe(404)
        expect(addResponse.status).toBe(404)
      }),
    ),
  )

  it.effect('reports 502 when mattermost rejects the request', () =>
    withWebHandler(
      applicationLayer({
        getUser: () => Effect.fail(new MattermostUnavailable({ message: 'down' })),
      }),
      (handler) =>
        Effect.gen(function* () {
          const monitorId = yield* registerViaHttp(handler)
          const response = yield* request(
            handler,
            `/monitor/${monitorId}/notification-target`,
            json({ mattermostUserId: mattermostUser.id }),
          )

          expect(response.status).toBe(502)
        }),
    ),
  )

  it.effect('reports 404 when the mattermost user does not exist', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const monitorId = yield* registerViaHttp(handler)
        const response = yield* request(
          handler,
          `/monitor/${monitorId}/notification-target`,
          json({ mattermostUserId: 'mm-missing' }),
        )

        expect(response.status).toBe(404)
      }),
    ),
  )
})

describe('monitor deletion', () => {
  it.effect('deletes a monitor and cascades its notification targets', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const monitorId = yield* registerViaHttp(handler)
        yield* request(
          handler,
          `/monitor/${monitorId}/notification-target`,
          json({ mattermostUserId: mattermostUser.id }),
        )

        const deleted = yield* request(handler, `/monitor/${monitorId}`, { method: 'DELETE' })

        expect(deleted.status).toBe(204)

        const after = yield* request(handler, `/monitor/${monitorId}/notification-target`)
        expect(after.status).toBe(404)
      }),
    ),
  )

  it.effect('rejects deleting an unknown monitor with 404', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(handler, '/monitor/00000000-0000-4000-8000-000000000000', {
          method: 'DELETE',
        })

        expect(response.status).toBe(404)
      }),
    ),
  )
})

describe('mattermost notification endpoints', () => {
  it.effect('searches mattermost users', () =>
    Effect.gen(function* () {
      const { notification } = yield* openClient

      const users = yield* notification.searchMattermostUsers({ payload: { term: 'jes' } })

      expect(users).toEqual([mattermostUser])
    }).pipe(Effect.provide(groupLayer())),
  )

  it.effect('rejects a blank search term with 400', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(
          handler,
          '/notification/mattermost/user/search',
          json({ term: '   ' }),
        )

        expect(response.status).toBe(400)
      }),
    ),
  )

  it.effect('sends a test direct message', () => {
    const sent = Effect.runSync(
      Ref.make<ReadonlyArray<Readonly<{ userId: string; message: string }>>>([]),
    )

    return Effect.gen(function* () {
      const { notification } = yield* openClient

      yield* notification.sendMattermostTest({
        payload: { mattermostUserId: botUser.id },
      })

      const messages = yield* Ref.get(sent)
      expect(messages).toEqual([
        {
          userId: botUser.id,
          message: 'This is a test notification from Uptime Watchdog.',
        },
      ])
    }).pipe(
      Effect.provide(
        groupLayer({
          getUser: () => Effect.succeed(botUser),
          sendDirectMessage: (userId, message) =>
            Ref.update(sent, (entries) => [...entries, { userId, message }]),
        }),
      ),
    )
  })

  it.effect('surfaces a mattermost user that does not exist', () =>
    Effect.gen(function* () {
      const { notification } = yield* openClient

      const error = yield* notification
        .sendMattermostTest({ payload: { mattermostUserId: 'mm-missing' } })
        .pipe(Effect.flip)

      expect(error).toMatchObject({ _tag: 'MattermostUserNotFound' })
    }).pipe(Effect.provide(groupLayer())),
  )

  it.effect('surfaces mattermost being unavailable', () =>
    Effect.gen(function* () {
      const { notification } = yield* openClient

      const error = yield* notification
        .searchMattermostUsers({ payload: { term: 'jes' } })
        .pipe(Effect.flip)

      expect(error).toMatchObject({ _tag: 'MattermostUnavailable' })
    }).pipe(
      Effect.provide(
        groupLayer({
          searchUsers: () => Effect.fail(new MattermostUnavailable({ message: 'down' })),
        }),
      ),
    ),
  )
})

describe('schedule conversion', () => {
  const description = 'Every 5 minutes'

  it.effect('converts a schedule description into a cron expression', () =>
    Effect.gen(function* () {
      const { schedule } = yield* openClient

      const { cron } = yield* schedule.convertDescription({ payload: { description } })

      expect(Cron.format(cron)).toBe('0-55/5 * * * *')
    }).pipe(Effect.provide(groupLayer())),
  )

  it.effect('reports 502 when the provider is unavailable', () =>
    withWebHandler(
      applicationLayer(
        {},
        {
          convert: () => Effect.fail(new ProviderUnavailable({ message: ' Gem: down' })),
        },
      ),
      (handler) =>
        Effect.gen(function* () {
          const response = yield* request(handler, '/cron', json({ description }))

          expect(response.status).toBe(502)
        }),
    ),
  )

  it.effect('reports 429 when the provider tokens are exhausted', () =>
    withWebHandler(
      applicationLayer(
        {},
        {
          convert: () => Effect.fail(new TokensExhausted()),
        },
      ),
      (handler) =>
        Effect.gen(function* () {
          const response = yield* request(handler, '/cron', json({ description }))

          expect(response.status).toBe(429)
        }),
    ),
  )

  it.effect('reports 422 when the description cannot be converted', () =>
    withWebHandler(
      applicationLayer(
        {},
        {
          convert: () =>
            Effect.fail(
              new DescriptionNotConvertible({ description: 'nope', message: 'not schedulable' }),
            ),
        },
      ),
      (handler) =>
        Effect.gen(function* () {
          const response = yield* request(handler, '/cron', json({ description }))

          expect(response.status).toBe(422)
        }),
    ),
  )

  it.effect('rejects a blank description with 400', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(handler, '/cron', json({ description: '   ' }))

        expect(response.status).toBe(400)
      }),
    ),
  )

  it.effect('rejects an over-long description with 400', () =>
    withWebHandler(applicationLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(
          handler,
          '/cron',
          json({ description: 'Every twenty-six seconds'.repeat(20) }),
        )

        expect(response.status).toBe(400)
      }),
    ),
  )
})
