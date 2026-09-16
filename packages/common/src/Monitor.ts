import { Cron as EffectCron, Effect, Result, Schema, SchemaGetter, SchemaIssue } from 'effect'
import { Model } from 'effect/unstable/schema'
import { type UptimeObservation, UptimeRequest } from './Uptime'

export const Uuid = Schema.String.pipe(Schema.check(Schema.isUUID()))
export type Uuid = typeof Uuid.Type

export const MonitorId = Schema.brand('MonitorId')(Uuid)
export type MonitorId = typeof MonitorId.Type

export const MONITOR_NAME_MAX_LENGTH = 128

export const EXPECTED_STATUS_MIN = 100
export const EXPECTED_STATUS_MAX = 599

export const ExpectedStatus = Schema.Natural.pipe(
  Schema.check(Schema.isBetween({ minimum: EXPECTED_STATUS_MIN, maximum: EXPECTED_STATUS_MAX })),
)
export type ExpectedStatus = typeof ExpectedStatus.Type

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
  expectedStatus: ExpectedStatus,
  createdAt: Model.DateTimeInsert,
}) {}

export const MonitorDefinition = Monitor.jsonCreate
export type MonitorDefinition = typeof MonitorDefinition.Type

export type MonitorObservation = {
  monitor: Monitor
  observation: UptimeObservation
}
