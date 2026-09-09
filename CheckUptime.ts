import { Context, Duration, Effect, Layer, Schema } from "effect"
import {
  HttpClient,
  HttpClientRequest,
  HttpMethod as Hm,
  HttpClientError,
} from "effect/unstable/http"
import { HeadersSchema } from "effect/unstable/http/Headers"

const HttpMethod = Schema.String.pipe(Schema.refine(Hm.isHttpMethod))
type HttpMethod = Hm.HttpMethod

const Protocol = Schema.Literals(["http", "https"])
type Protocol = typeof Protocol.Type

const Hostname = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))
type Hostname = typeof Hostname.Type

const Port = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))
type Port = typeof Port.Type

const UptimeRequest = Schema.Struct({
  hostname: Hostname,
  port: Port,
  protocol: Protocol,
  method: HttpMethod,
  headers: HeadersSchema,
})

type UptimeRequest = typeof UptimeRequest.Type

type UptimeResponse = {
  duration: Duration.Duration
  status: number
  body: string
}

type Interface = (
  server: UptimeRequest,
) => Effect.Effect<UptimeResponse, HttpClientError.HttpClientError>

export class CheckUptime extends Context.Service<CheckUptime, Interface>()("CheckUptimeUseCase") {}

const buildRequest = (request: UptimeRequest): HttpClientRequest.HttpClientRequest => {
  return HttpClientRequest.make(request.method)(
    `${request.protocol}://${request.hostname}:${request.port}`,
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
      const [duration, { status, body }] = yield* Effect.gen(function* () {
        const response = yield* client.execute(buildRequest(request))
        const body = yield* response.text
        return { status: response.status, body } as const
      }).pipe(Effect.timed)

      return { duration, status, body }
    })
  }),
)
