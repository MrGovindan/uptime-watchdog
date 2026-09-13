import { Cron, DateTime, Effect, Result, Schema, SchemaGetter, SchemaIssue } from "effect"
import { HttpMethod as Hm, HttpClientError } from "effect/unstable/http"

export const Uuid = Schema.String.pipe(Schema.check(Schema.isUUID()))
export type Uuid = typeof Uuid.Type

export const ServiceId = Schema.brand("ServiceId")(Uuid)
export type ServiceId = typeof ServiceId.Type

export const HttpMethod = Schema.String.pipe(Schema.refine(Hm.isHttpMethod))
export type HttpMethod = Hm.HttpMethod

export const Protocol = Schema.Literals(["http", "https"])
export type Protocol = typeof Protocol.Type

export const Hostname = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))
export type Hostname = typeof Hostname.Type

export const Port = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))
export type Port = typeof Port.Type

const CronFromSelf = Schema.declare(Cron.isCron, {
  identifier: "Cron",
  description: "A parsed Cron schedule",
})

export const CronExpression = Schema.String.pipe(
  Schema.decodeTo(CronFromSelf, {
    decode: SchemaGetter.transformEffect((expression: string) =>
      Effect.fromResult(
        Cron.parse(expression).pipe(
          Result.mapError((e) => new SchemaIssue.InvalidValue({ message: e.message })),
        ),
      ),
    ),

    encode: SchemaGetter.transform(Cron.format),
  }),
)

export const UptimeRequest = Schema.Struct({
  hostname: Hostname,
  port: Port,
  protocol: Protocol,
  method: HttpMethod,
  path: Schema.optional(Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))),
  headers: Schema.Record(Schema.String, Schema.String),
})

export type UptimeRequest = typeof UptimeRequest.Type

export const UptimeResponse = Schema.Struct({
  duration: Schema.Duration,
  status: Schema.Natural,
  body: Schema.String,
})
export type UptimeResponse = typeof UptimeResponse.Type

export type UptimeObservation = {
  time: DateTime.Utc
  response: Result.Result<UptimeResponse, HttpClientError.HttpClientError>
}

export type ServiceObservation = UptimeObservation & { serviceId: ServiceId }

export const ServiceMonitorConfiguration = Schema.Struct({
  serviceId: ServiceId,
  requestConfiguration: UptimeRequest,
  cronSchedule: CronExpression,
})
export type ServiceMonitorConfiguration = typeof ServiceMonitorConfiguration.Type

// type ServiceConfigurationError = NoSuchElementError | SchemaError

// type ServiceMonitorConfigurationSource = {
//   get: (
//     serviceId: ServiceId,
//   ) => Effect.Effect<ServiceMonitorConfiguration, ServiceConfigurationError>
// }
