import { Context, Data, Effect, Schema } from "effect"
import { HttpMethod as Hm } from "effect/unstable/http"
import { HeadersSchema } from "effect/unstable/http/Headers"

const HttpMethod = Schema.String.pipe(Schema.refine(Hm.isHttpMethod))
type HttpMethod = Hm.HttpMethod

const UptimeRequest = Schema.Struct({
  hostname: Schema.Trim.pipe(Schema.check(Schema.isNonEmpty())),
  port: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
  method: HttpMethod,
  headers: Schema.optionalKey(HeadersSchema),
  timeout: Schema.Duration,
})

type UptimeRequest = typeof UptimeRequest.Type

type MonitorResponse = {
  duration: Schema.Duration
  status: number
  body: string
}

class TimeoutError extends Data.TaggedError("TimeoutError") {}
class UnreachableError extends Data.TaggedError("UnreachableError") {}

type Interface = {
  execute: (
    request: UptimeRequest,
  ) => Effect.Effect<MonitorResponse, TimeoutError | UnreachableError>
}

export class CheckUptimeUseCase extends Context.Service<CheckUptimeUseCase, Interface>()(
  "CheckUptimeUseCase",
) {}
