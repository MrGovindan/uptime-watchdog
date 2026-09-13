import { Context, DateTime, Effect, Layer, Option, pipe } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import type { UptimeObservation, UptimeRequest } from './Types'

export type Interface = (server: UptimeRequest) => Effect.Effect<UptimeObservation>

export class CheckUptime extends Context.Service<CheckUptime, Interface>()('CheckUptimeUseCase') {}

const buildRequest = (request: UptimeRequest): HttpClientRequest.HttpClientRequest => {
  const path = pipe(
    Option.fromUndefinedOr(request.path),
    Option.map((path) => (path.startsWith('/') ? path.slice(1) : path)),
    Option.getOrElse(() => ''),
  )
  return HttpClientRequest.make(request.method)(
    `${request.protocol}://${request.hostname}:${request.port}/${path}`,
    {
      headers: request.headers,
    },
  )
}

export const layer = Layer.effect(
  CheckUptime,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    return Effect.fn(CheckUptime.name)(function* (request: UptimeRequest) {
      const time = yield* DateTime.now

      const response = yield* Effect.gen(function* () {
        const [duration, { status, body }] = yield* Effect.gen(function* () {
          const httpResponse = yield* client.execute(buildRequest(request))
          const body = yield* httpResponse.text
          return { status: httpResponse.status, body } as const
        }).pipe(Effect.timed)

        return { duration, status, body }
      }).pipe(Effect.result)

      return { time, response }
    })
  }),
)
