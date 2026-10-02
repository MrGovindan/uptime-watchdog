import { Cron, DateTime, Effect, Result, Schema, SchemaGetter, SchemaIssue } from 'effect'
import { HttpMethod as Hm, HttpClientError } from 'effect/http'

export const NonEmptyTrimmedString = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))

export const HttpMethod = Schema.String.pipe(Schema.refine(Hm.isHttpMethod))
export type HttpMethod = Hm.HttpMethod

export const Protocol = Schema.Literals(['http', 'https'])
export type Protocol = typeof Protocol.Type

export const Hostname = NonEmptyTrimmedString
export type Hostname = typeof Hostname.Type

export const PORT_MIN = 1
export const PORT_MAX = 65535

export const Port = Schema.brand('Port')(
  Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: PORT_MIN, maximum: PORT_MAX }))),
)
export type Port = typeof Port.Type

export const PortFromString = Schema.NumberFromString.pipe(Schema.decodeTo(Port))
export type PortFromString = typeof PortFromString.Type

const CronFromSelf = Schema.declare(Cron.isCron, {
  identifier: 'Cron',
  description: 'A parsed Cron schedule',
})

export const CronExpression = Schema.String.pipe(
  Schema.decodeTo(CronFromSelf, {
    decode: SchemaGetter.transformEffect((expression: string) =>
      Effect.fromResult(
        Cron.parse(expression).pipe(Result.mapError((e) => new SchemaIssue.InvalidValue({ message: e.message }))),
      ),
    ),

    encode: SchemaGetter.transform(Cron.format),
  }),
)

export const CronDescriptionMax = 256

export const CronDescription = NonEmptyTrimmedString.pipe(Schema.check(Schema.isMaxLength(CronDescriptionMax)))
export type CronDescription = typeof CronDescription.Type

export const Headers = Schema.Record(NonEmptyTrimmedString, NonEmptyTrimmedString)

export const UptimeRequest = Schema.Struct({
  hostname: Hostname,
  port: Port,
  protocol: Protocol,
  method: HttpMethod,
  path: Schema.optional(Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))),
  headers: Headers,
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
