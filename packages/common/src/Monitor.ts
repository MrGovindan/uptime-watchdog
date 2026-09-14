import { Cron as EffectCron, Effect, Result, Schema, SchemaGetter, SchemaIssue } from 'effect'
import { Model } from 'effect/unstable/schema'
import { type UptimeObservation, UptimeRequest } from './Uptime'

export const Uuid = Schema.String.pipe(Schema.check(Schema.isUUID()))
export type Uuid = typeof Uuid.Type

export const MonitorId = Schema.brand('MonitorId')(Uuid)
export type MonitorId = typeof MonitorId.Type

export const MONITOR_NAME_MAX_LENGTH = 128

export const MonitorName = Schema.Trim.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.check(Schema.isMaxLength(MONITOR_NAME_MAX_LENGTH)),
)
export type MonitorName = typeof MonitorName.Type

const Cron = Schema.declare(EffectCron.isCron).pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.transformEffect((expression: string) =>
      Effect.fromResult(
        EffectCron.parse(expression).pipe(
          Result.mapError((error) => new SchemaIssue.InvalidValue({ message: error.message })),
        ),
      ),
    ),

    encode: SchemaGetter.transform(EffectCron.format),
  }),
)

const CreatedAt = Schema.String.pipe(
  Schema.withConstructorDefault(Effect.sync(() => new Date().toISOString())),
)

export class Monitor extends Model.Class<Monitor>('Monitor')({
  id: Model.GeneratedByApp(MonitorId),
  name: MonitorName,
  request: Model.Field({
    select: Schema.fromJsonString(UptimeRequest),
    insert: Schema.fromJsonString(UptimeRequest),
    update: Schema.fromJsonString(UptimeRequest),
    json: UptimeRequest,
    jsonCreate: UptimeRequest,
    jsonUpdate: UptimeRequest,
  }),
  cronSchedule: Cron,
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
  monitorName: MonitorName
  observation: UptimeObservation
}
