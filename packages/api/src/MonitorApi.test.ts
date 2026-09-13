import { BunHttpServer } from '@effect/platform-bun'
import { Api, MonitorDefinition } from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { Cron, Effect, Layer, Schema } from 'effect'
import { HttpRouter } from 'effect/unstable/http'
import { HttpApiTest } from 'effect/unstable/httpapi'
import * as Database from './Database'
import * as MonitorApi from './MonitorApi'
import * as MonitorEvents from './MonitorEvents'
import { layer as monitorRepositoryLayer } from './MonitorRepository'

const dependencies = Layer.provideMerge(BunHttpServer.layerHttpServices)

const repositoryLayer = () =>
  monitorRepositoryLayer.pipe(
    Layer.provide(MonitorEvents.layer),
    Layer.provide(Database.layer(':memory:')),
  )

const groupLayer = () =>
  MonitorApi.MonitorGroupLive.pipe(Layer.provide(repositoryLayer()), dependencies)

const applicationLayer = () => MonitorApi.layer.pipe(Layer.provide(repositoryLayer()), dependencies)

const openClient = HttpApiTest.groups(Api, ['monitor'])

const definition = Effect.runSync(
  Schema.decodeUnknownEffect(MonitorDefinition)({
    request: {
      hostname: 'example.test',
      port: 8080,
      protocol: 'https',
      method: 'GET',
      headers: {},
    },
    cronSchedule: '*/5 * * * *',
  }),
)

describe('monitor registration', () => {
  it.effect('registers a monitor with a generated id and defaulted headers', () =>
    Effect.gen(function* () {
      const { monitor } = yield* openClient

      const created = yield* monitor.register({ payload: definition })

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
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
    Effect.acquireUseRelease(
      Effect.sync(() => HttpRouter.toWebHandler(applicationLayer(), { disableLogger: true })),
      ({ handler }) =>
        Effect.gen(function* () {
          const response = yield* Effect.promise(() =>
            handler(
              new Request('http://localhost/monitor', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  request: { hostname: '', port: -1, protocol: 'ftp', method: 'NOPE' },
                  cronSchedule: 'not a cron',
                }),
              }),
            ),
          )

          expect(response.status).toBe(400)
        }),
      ({ dispose }) => Effect.promise(dispose),
    ),
  )
})
