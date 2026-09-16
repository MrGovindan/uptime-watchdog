import { Result, Schema } from 'effect'
import { HttpClientError } from 'effect/unstable/http'
import { ExpectedStatus, Monitor } from './Monitor'
import { type UptimeObservation, UptimeResponse } from './Uptime'

export const ObservationOutcome = Schema.TaggedUnion({
  Expected: { response: UptimeResponse },
  Unexpected: { response: UptimeResponse },
  Error: { error: HttpClientError.HttpClientErrorSchema },
})
export type ObservationOutcome = typeof ObservationOutcome.Type

export const DegradedReason = Schema.Union([
  ObservationOutcome.cases.Unexpected,
  ObservationOutcome.cases.Error,
])
export type DegradedReason = typeof DegradedReason.Type

export const MonitorHealth = Schema.TaggedUnion({
  Healthy: { time: Schema.DateTimeUtc, response: UptimeResponse },
  Degraded: { time: Schema.DateTimeUtc, reason: DegradedReason },
})
export type MonitorHealth = typeof MonitorHealth.Type

export const MonitorWithHealth = Schema.Struct({
  monitor: Monitor.json,
  health: Schema.Option(MonitorHealth),
})
export type MonitorWithHealth = typeof MonitorWithHealth.Type

export const toMonitorHealth = (
  observation: UptimeObservation,
  expectedStatus: ExpectedStatus,
): MonitorHealth =>
  Result.match(observation.response, {
    onSuccess: (response) =>
      response.status === expectedStatus
        ? { _tag: 'Healthy', time: observation.time, response }
        : { _tag: 'Degraded', time: observation.time, reason: { _tag: 'Unexpected', response } },
    onFailure: (error) => ({
      _tag: 'Degraded',
      time: observation.time,
      reason: {
        _tag: 'Error',
        error: HttpClientError.HttpClientErrorSchema.fromHttpClientError(error),
      },
    }),
  })
