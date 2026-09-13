import { Cron, Effect, Result, Schema, SchemaGetter, SchemaIssue } from 'effect'
import { Model } from 'effect/unstable/schema'
import { type UptimeObservation, UptimeRequest } from './Uptime'

export const Uuid = Schema.String.pipe(Schema.check(Schema.isUUID()))
export type Uuid = typeof Uuid.Type

export const MonitorId = Schema.brand('MonitorId')(Uuid)
export type MonitorId = typeof MonitorId.Type

const CronExpressionString = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transformEffect((expression: string) =>
      Effect.fromResult(
        Cron.parse(expression).pipe(
          Result.map(() => expression),
          Result.mapError((error) => new SchemaIssue.InvalidValue({ message: error.message })),
        ),
      ),
    ),

    encode: SchemaGetter.passthrough(),
  }),
)

const CreatedAt = Schema.String.pipe(
  Schema.withConstructorDefault(Effect.sync(() => new Date().toISOString())),
)

export class Monitor extends Model.Class<Monitor>('Monitor')({
  id: Model.GeneratedByApp(MonitorId),
  request: Model.Field({
    select: Schema.fromJsonString(UptimeRequest),
    insert: Schema.fromJsonString(UptimeRequest),
    update: Schema.fromJsonString(UptimeRequest),
    json: UptimeRequest,
    jsonCreate: UptimeRequest,
    jsonUpdate: UptimeRequest,
  }),
  cronSchedule: CronExpressionString,
  createdAt: Model.Field({
    select: Schema.String,
    insert: CreatedAt,
    json: Schema.String,
  }),
}) {}

export const MonitorDefinition = Monitor.jsonCreate
export type MonitorDefinition = typeof MonitorDefinition.Type

export type MonitorObservation = {
  monitorId: MonitorId
  observation: UptimeObservation
}
