import {
  DescriptionNotConvertible,
  MattermostUnavailable,
  MonitorDefinition,
  PORT_MAX,
  ProviderUnavailable,
  TokensExhausted,
} from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { Cron, Effect, Option, Ref, Schema } from 'effect'
import { HttpRouter } from 'effect/http'
import type { Interface as CheckUptimeInterface } from './CheckUptime'
import {
  botUser,
  definitionJson,
  mattermostUser,
  observation,
  openClient,
  waitFor,
  watchdogLayer,
  type TestSeams,
} from './testing'

const client = (seams: TestSeams = {}) => openClient(watchdogLayer(seams))

const definition = Effect.runSync(Schema.decodeUnknownEffect(MonitorDefinition)(definitionJson))

const request = (handler: (request: Request) => Promise<Response>, path: string, init?: RequestInit) =>
  Effect.promise(() => handler(new Request(`http://localhost${path}`, init)))

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const withWebHandler = (
  layer: ReturnType<typeof watchdogLayer>,
  run: (handler: (request: Request) => Promise<Response>) => Effect.Effect<void>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => HttpRouter.toWebHandler(layer, { disableLogger: true })),
    ({ handler }) => run(handler),
    ({ dispose }) => Effect.promise(dispose),
  )

const registerViaHttp = (
  handler: (request: Request) => Promise<Response>,
  body: unknown = definitionJson,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const response = yield* request(handler, '/monitor', json(body))
    expect(response.status).toBe(201)

    const created = (yield* Effect.promise(() => response.json())) as { id: string }
    return created.id
  })

describe('monitor registration', () => {
  it.effect('registers a monitor with a generated id and defaulted headers', () =>
    Effect.gen(function* () {
      const { monitor } = yield* client()

      const created = yield* monitor.register({ payload: definition })

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(created.name).toBe('Prod API')
      expect(created.request).toMatchObject(definition.request)
      expect(created.request.headers).toEqual({})
      expect(Cron.isCron(created.cronSchedule)).toBe(true)
      expect(Cron.format(created.cronSchedule)).toBe('0-55/5 * * * *')
    }),
  )

  it.effect('lists registered monitors as pending before any observation', () =>
    Effect.gen(function* () {
      const { monitor } = yield* client({ checkUptime: () => Effect.never })

      const created = yield* monitor.register({ payload: definition })
      const monitors = yield* monitor.list({})

      expect(Option.isNone(monitors[0]!.health)).toBe(true)
      expect(monitors[0]).toMatchObject({ monitor: created })
    }),
  )

  it.effect('rejects an invalid definition with 400', () =>
    withWebHandler(watchdogLayer(), (handler) =>
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
    withWebHandler(watchdogLayer(), (handler) =>
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

  it.effect('rejects a port outside the TCP range with 400', () =>
    withWebHandler(watchdogLayer(), (handler) =>
      Effect.gen(function* () {
        const ports = [0, -1, 80.5, PORT_MAX + 1]

        for (const port of ports) {
          const response = yield* request(
            handler,
            '/monitor',
            json({ ...definitionJson, request: { ...definitionJson.request, port } }),
          )

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
  const updatedDefinition = Effect.runSync(Schema.decodeUnknownEffect(MonitorDefinition)(updatedJson))

  it.effect('replaces the definition, preserving the id and createdAt', () =>
    Effect.gen(function* () {
      const { monitor } = yield* client({ checkUptime: () => Effect.never })

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
      expect(Option.isNone(monitors[0]!.health)).toBe(true)
      expect(monitors[0]).toMatchObject({ monitor: updated })
    }),
  )

  it.effect('rejects updating an unknown monitor with 404', () =>
    withWebHandler(watchdogLayer(), (handler) =>
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
    withWebHandler(watchdogLayer(), (handler) =>
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
      const { monitor } = yield* client()

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
    }),
  )

  it.effect('lists the targets of a monitor', () =>
    Effect.gen(function* () {
      const { monitor } = yield* client()

      const created = yield* monitor.register({ payload: definition })
      const target = yield* monitor.addNotificationTarget({
        params: { monitorId: created.id },
        payload: { mattermostUserId: mattermostUser.id },
      })

      const targets = yield* monitor.listNotificationTargets({ params: { monitorId: created.id } })

      expect(targets).toEqual([target])
    }),
  )

  it.effect('removes a target idempotently', () =>
    Effect.gen(function* () {
      const { monitor } = yield* client()

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
    }),
  )

  it.effect('rejects a duplicate target with 409', () =>
    withWebHandler(watchdogLayer(), (handler) =>
      Effect.gen(function* () {
        const monitorId = yield* registerViaHttp(handler)
        const body = { mattermostUserId: mattermostUser.id }

        yield* request(handler, `/monitor/${monitorId}/notification-target`, json(body))
        const response = yield* request(handler, `/monitor/${monitorId}/notification-target`, json(body))

        expect(response.status).toBe(409)
      }),
    ),
  )

  it.effect('rejects an unknown monitor with 404', () =>
    withWebHandler(watchdogLayer(), (handler) =>
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
      watchdogLayer({
        mattermost: {
          getUser: () => Effect.fail(new MattermostUnavailable({ message: 'down' })),
        },
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
    withWebHandler(watchdogLayer(), (handler) =>
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
    withWebHandler(watchdogLayer(), (handler) =>
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
    withWebHandler(watchdogLayer(), (handler) =>
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
      const { notification } = yield* client()

      const users = yield* notification.searchMattermostUsers({ payload: { term: 'jes' } })

      expect(users).toEqual([mattermostUser])
    }),
  )

  it.effect('rejects a blank search term with 400', () =>
    withWebHandler(watchdogLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(handler, '/notification/mattermost/user/search', json({ term: '   ' }))

        expect(response.status).toBe(400)
      }),
    ),
  )

  it.effect('sends a test direct message', () => {
    const sent = Effect.runSync(Ref.make<ReadonlyArray<Readonly<{ userId: string; message: string }>>>([]))

    return Effect.gen(function* () {
      const { notification } = yield* client({
        mattermost: {
          getUser: () => Effect.succeed(botUser),
          sendDirectMessage: (userId, message) => Ref.update(sent, (entries) => [...entries, { userId, message }]),
        },
      })

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
    })
  })
})

describe('monitor health', () => {
  const statuses = () => Effect.runSync(Ref.make<Record<string, number>>({}))

  const scriptedCheckUptime =
    (script: Ref.Ref<Record<string, number>>): CheckUptimeInterface =>
    (request) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(script)
        const status = current[request.hostname]
        if (status === undefined) {
          return yield* Effect.never
        }
        return observation(status)
      })

  const setStatus = (script: Ref.Ref<Record<string, number>>, hostname: string, status: number) =>
    Ref.update(script, (current) => ({ ...current, [hostname]: status }))

  type Listed = {
    monitor: { id: string }
    health: { _tag: string; value?: { _tag?: string; reason?: unknown; response?: { status?: number } } }
  }

  const listMonitorsViaHttp = (handler: (req: Request) => Promise<Response>) =>
    Effect.gen(function* () {
      const response = yield* request(handler, '/monitor')
      expect(response.status).toBe(200)
      return (yield* Effect.promise(() => response.json())) as Array<Listed>
    })

  const checkViaHttp = (handler: (req: Request) => Promise<Response>, monitorId: string) =>
    Effect.gen(function* () {
      const response = yield* request(handler, `/monitor/${monitorId}/check`, { method: 'POST' })
      expect(response.status).toBe(200)
    })

  it.effect('reports health from the observation stream', () => {
    const script = statuses()

    return withWebHandler(watchdogLayer({ checkUptime: scriptedCheckUptime(script) }), (handler) =>
      Effect.gen(function* () {
        const monitorId = yield* registerViaHttp(handler)

        const pending = yield* listMonitorsViaHttp(handler)
        expect(pending).toHaveLength(1)
        expect(pending[0]).toMatchObject({
          monitor: { id: monitorId },
          health: { _tag: 'None' },
        })

        yield* setStatus(script, 'example.test', 200)
        yield* checkViaHttp(handler, monitorId)

        const [observed] = yield* waitFor(
          listMonitorsViaHttp(handler),
          (monitors) => monitors.length === 1 && monitors[0]!.health._tag === 'Some',
        )
        expect(observed!.monitor.id).toBe(monitorId)
        expect(observed!.health.value).toMatchObject({
          _tag: 'Healthy',
          response: { status: 200 },
        })
      }),
    )
  })

  it.effect('keeps other monitors pending and drops deleted monitors', () => {
    const script = statuses()

    return withWebHandler(watchdogLayer({ checkUptime: scriptedCheckUptime(script) }), (handler) =>
      Effect.gen(function* () {
        const firstId = yield* registerViaHttp(handler, {
          ...definitionJson,
          request: { ...definitionJson.request, hostname: 'first.test' },
        })
        const secondId = yield* registerViaHttp(handler, {
          ...definitionJson,
          request: { ...definitionJson.request, hostname: 'second.test' },
        })

        yield* setStatus(script, 'first.test', 200)
        yield* checkViaHttp(handler, firstId)

        const listed = yield* waitFor(listMonitorsViaHttp(handler), (monitors) =>
          monitors.some((entry) => entry.monitor.id === firstId && entry.health._tag === 'Some'),
        )
        const firstMonitored = listed.find((entry) => entry.monitor.id === firstId)
        const secondMonitored = listed.find((entry) => entry.monitor.id === secondId)
        expect(firstMonitored).toMatchObject({
          monitor: { id: firstId },
          health: { _tag: 'Some', value: { _tag: 'Healthy' } },
        })
        expect(secondMonitored).toMatchObject({
          monitor: { id: secondId },
          health: { _tag: 'None' },
        })

        const deleted = yield* request(handler, `/monitor/${firstId}`, { method: 'DELETE' })
        expect(deleted.status).toBe(204)

        const after = yield* listMonitorsViaHttp(handler)
        expect(after).toHaveLength(1)
        expect(after[0]!.monitor.id).toBe(secondId)
        expect(after[0]!.health._tag).toBe('None')
      }),
    )
  })

  it.effect('transitions between healthy and degraded as observations change', () => {
    const script = statuses()

    return withWebHandler(watchdogLayer({ checkUptime: scriptedCheckUptime(script) }), (handler) =>
      Effect.gen(function* () {
        const monitorId = yield* registerViaHttp(handler)

        yield* setStatus(script, 'example.test', 200)
        yield* checkViaHttp(handler, monitorId)
        yield* waitFor(
          listMonitorsViaHttp(handler),
          (monitors) => monitors[0]?.health._tag === 'Some' && monitors[0]!.health.value?._tag === 'Healthy',
        )

        yield* setStatus(script, 'example.test', 503)
        yield* checkViaHttp(handler, monitorId)
        yield* waitFor(
          listMonitorsViaHttp(handler),
          (monitors) => monitors[0]?.health._tag === 'Some' && monitors[0]!.health.value?._tag === 'Degraded',
        )

        yield* setStatus(script, 'example.test', 200)
        yield* checkViaHttp(handler, monitorId)
        yield* waitFor(
          listMonitorsViaHttp(handler),
          (monitors) => monitors[0]?.health._tag === 'Some' && monitors[0]!.health.value?._tag === 'Healthy',
        )
      }),
    )
  })

  it.effect('runs a check on demand and returns the resulting health', () =>
    Effect.gen(function* () {
      const { monitor } = yield* client()

      const created = yield* monitor.register({ payload: definition })

      const health = yield* monitor.checkMonitor({ params: { monitorId: created.id } })

      expect(health).toMatchObject({ _tag: 'Healthy', response: { status: 200 } })
    }),
  )

  it.effect('broadcasts an on-demand check to other clients', () =>
    withWebHandler(watchdogLayer(), (handler) =>
      Effect.gen(function* () {
        const monitorId = yield* registerViaHttp(handler)

        const response = yield* request(handler, `/monitor/${monitorId}/check`, { method: 'POST' })
        expect(response.status).toBe(200)

        const [observed] = yield* waitFor(
          listMonitorsViaHttp(handler),
          (monitors) => monitors[0]?.health._tag === 'Some',
        )
        expect(observed!.health.value).toMatchObject({ _tag: 'Healthy', response: { status: 200 } })
      }),
    ),
  )

  it.effect('rejects checking an unknown monitor with 404', () =>
    withWebHandler(watchdogLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(handler, '/monitor/00000000-0000-4000-8000-000000000000/check', {
          method: 'POST',
        })

        expect(response.status).toBe(404)
      }),
    ),
  )
})

describe('mattermost extra notification endpoints', () => {
  it.effect('surfaces a mattermost user that does not exist', () =>
    Effect.gen(function* () {
      const { notification } = yield* client()

      const error = yield* notification
        .sendMattermostTest({ payload: { mattermostUserId: 'mm-missing' } })
        .pipe(Effect.flip)

      expect(error).toMatchObject({ _tag: 'MattermostUserNotFound' })
    }),
  )

  it.effect('surfaces mattermost being unavailable', () =>
    Effect.gen(function* () {
      const { notification } = yield* client({
        mattermost: {
          searchUsers: () => Effect.fail(new MattermostUnavailable({ message: 'down' })),
        },
      })

      const error = yield* notification.searchMattermostUsers({ payload: { term: 'jes' } }).pipe(Effect.flip)

      expect(error).toMatchObject({ _tag: 'MattermostUnavailable' })
    }),
  )
})

describe('schedule conversion', () => {
  const description = 'Every 5 minutes'

  it.effect('converts a schedule description into a cron expression', () =>
    Effect.gen(function* () {
      const { schedule } = yield* client()

      const { cron } = yield* schedule.convertDescription({ payload: { description } })

      expect(Cron.format(cron)).toBe('0-55/5 * * * *')
    }),
  )

  it.effect('reports 502 when the provider is unavailable', () =>
    withWebHandler(
      watchdogLayer({
        cronConversion: {
          convert: () => Effect.fail(new ProviderUnavailable({ message: ' Gem: down' })),
        },
      }),
      (handler) =>
        Effect.gen(function* () {
          const response = yield* request(handler, '/cron', json({ description }))

          expect(response.status).toBe(502)
        }),
    ),
  )

  it.effect('reports 429 when the provider tokens are exhausted', () =>
    withWebHandler(
      watchdogLayer({
        cronConversion: {
          convert: () => Effect.fail(new TokensExhausted()),
        },
      }),
      (handler) =>
        Effect.gen(function* () {
          const response = yield* request(handler, '/cron', json({ description }))

          expect(response.status).toBe(429)
        }),
    ),
  )

  it.effect('reports 422 when the description cannot be converted', () =>
    withWebHandler(
      watchdogLayer({
        cronConversion: {
          convert: () =>
            Effect.fail(new DescriptionNotConvertible({ description: 'nope', message: 'not schedulable' })),
        },
      }),
      (handler) =>
        Effect.gen(function* () {
          const response = yield* request(handler, '/cron', json({ description }))

          expect(response.status).toBe(422)
        }),
    ),
  )

  it.effect('rejects a blank description with 400', () =>
    withWebHandler(watchdogLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(handler, '/cron', json({ description: '   ' }))

        expect(response.status).toBe(400)
      }),
    ),
  )

  it.effect('rejects an over-long description with 400', () =>
    withWebHandler(watchdogLayer(), (handler) =>
      Effect.gen(function* () {
        const response = yield* request(handler, '/cron', json({ description: 'Every twenty-six seconds'.repeat(20) }))

        expect(response.status).toBe(400)
      }),
    ),
  )
})
