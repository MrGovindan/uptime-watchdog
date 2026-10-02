import { Api, type MattermostUser, MattermostUserNotFound, type UptimeObservation } from '@uptime-watchdog/common'
import { BunHttpServer } from '@effect/platform-bun'
import { Cron, DateTime, Duration, Effect, Layer, Result } from 'effect'
import { HttpClient, HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'

import * as CheckUptime from './CheckUptime'
import { type Interface as CronConversionInterface, CronConversion } from './CronConversion'
import { type Interface as MattermostInterface, Mattermost } from './Mattermost'
import * as Watchdog from './Watchdog'

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

const platform = BunHttpServer.layerHttpServices

export const cronConversionStub = (overrides: Partial<CronConversionInterface> = {}): Layer.Layer<CronConversion> => {
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

export const mattermostStub = (overrides: Partial<MattermostInterface> = {}): Layer.Layer<Mattermost> => {
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
      users.has(userId) ? Effect.void : Effect.fail(new MattermostUserNotFound({ mattermostUserId: userId })),
  }

  return Layer.succeed(Mattermost, { ...base, ...overrides })
}

export const observation = (status = 200): UptimeObservation => ({
  time: DateTime.nowUnsafe(),
  response: Result.succeed({ duration: Duration.millis(5), status, body: 'pong' }),
})

export const checkUptimeStub = (observe?: CheckUptime.Interface): Layer.Layer<CheckUptime.CheckUptime> =>
  Layer.succeed(CheckUptime.CheckUptime, observe ?? (() => Effect.succeed(observation())))

export interface TestSeams {
  readonly databasePath?: string
  readonly staticRoot?: string
  readonly checkUptime?: CheckUptime.Interface
  readonly mattermost?: Partial<MattermostInterface>
  readonly cronConversion?: Partial<CronConversionInterface>
}

export const watchdogLayer = (seams: TestSeams = {}) =>
  Watchdog.layer({
    databasePath: seams.databasePath ?? ':memory:',
    staticRoot: seams.staticRoot ?? process.cwd(),
  }).pipe(
    Layer.provide(checkUptimeStub(seams.checkUptime)),
    Layer.provide(mattermostStub(seams.mattermost)),
    Layer.provide(cronConversionStub(seams.cronConversion)),
    Layer.provide(platform),
  )

// Self-contained services for tests that inspect the graph directly. The
// routes register against a throwaway router so the `HttpRouter` requirement
// does not leak into the test.
export const servicesLayer = (seams: TestSeams = {}) =>
  watchdogLayer(seams).pipe(Layer.provide(Layer.fresh(HttpRouter.layer)))

// A typed client over the same router production serves, so tests cross the
// Watchdog seam instead of rebuilding the graph or reaching into its services.
export const openClient = (layer: ReturnType<typeof watchdogLayer>) =>
  Effect.gen(function* () {
    const handler = yield* HttpRouter.toHttpEffect(layer)

    const httpClient = HttpClient.make(
      Effect.fnUntraced(function* (request) {
        const serverRequest = HttpServerRequest.fromClientRequest(request)
        const response = yield* handler.pipe(
          Effect.provideService(HttpServerRequest.HttpServerRequest, serverRequest),
          Effect.orDie,
        )
        return HttpServerResponse.toClientResponse(response, { request })
      }, Effect.scoped),
    )

    return yield* HttpApiClient.makeWith(Api, { httpClient, baseUrl: 'http://localhost:3000' })
  })

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
