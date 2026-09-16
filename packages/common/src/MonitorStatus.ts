import { Result, Schema } from 'effect'
import { HttpClientError } from 'effect/unstable/http'
import { Monitor } from './Monitor'
import { UptimeResponse } from './Uptime'

export const ObservationOutcome = Schema.TaggedUnion({
  Success: { response: UptimeResponse },
  Failure: { error: HttpClientError.HttpClientErrorSchema },
})

export type ObservationOutcome = typeof ObservationOutcome.Type

export const MonitorStatus = Schema.Struct({
  time: Schema.DateTimeUtc,
  outcome: ObservationOutcome,
})

export type MonitorStatus = typeof MonitorStatus.Type

export const MonitorWithStatus = Schema.Struct({
  monitor: Monitor.json,
  status: Schema.Option(MonitorStatus),
})

export type MonitorWithStatus = typeof MonitorWithStatus.Type

export const toObservationOutcome = (
  response: Result.Result<UptimeResponse, HttpClientError.HttpClientError>,
): ObservationOutcome =>
  Result.match(response, {
    onSuccess: (response) => ({ _tag: 'Success', response }),
    onFailure: (error) => ({
      _tag: 'Failure',
      error: HttpClientError.HttpClientErrorSchema.fromHttpClientError(error),
    }),
  })
