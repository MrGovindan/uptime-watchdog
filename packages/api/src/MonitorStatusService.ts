import { type MonitorId, type MonitorStatus, toObservationOutcome } from '@uptime-watchdog/common'
import { Context, Effect, HashMap, Layer, Option, Ref, Stream } from 'effect'
import * as MonitorStreams from './MonitorStreams'
import { WatchdogEvent, WatchdogEvents } from './WatchdogEvents'

export interface Interface {
  readonly getStatus: (monitorId: MonitorId) => Effect.Effect<Option.Option<MonitorStatus>>
}

export class MonitorStatusService extends Context.Service<MonitorStatusService, Interface>()(
  'MonitorStatus',
) {}

const make = Effect.gen(function* () {
  const streams = yield* MonitorStreams.MonitorStreams
  const events = yield* WatchdogEvents
  const statuses = yield* Ref.make(HashMap.empty<MonitorId, MonitorStatus>())
  yield* streams.observations.pipe(
    Stream.runForEach((observed) =>
      Ref.update(statuses, (current) =>
        HashMap.set(current, observed.monitorId, {
          time: observed.observation.time,
          outcome: toObservationOutcome(observed.observation.response),
        }),
      ),
    ),
    Effect.forkScoped,
  )
  yield* Effect.yieldNow

  yield* events.stream.pipe(
    Stream.runForEach((event) =>
      WatchdogEvent.match(event, {
        MonitorDeleted: ({ monitor }) =>
          Ref.update(statuses, (current) => HashMap.remove(current, monitor.id)),
        MonitorRegistered: () => Effect.void,
        MonitorUpdated: () => Effect.void,
        NotificationTargetAdded: () => Effect.void,
        NotificationTargetRemoved: () => Effect.void,
      }),
    ),
    Effect.forkScoped,
  )
  yield* Effect.yieldNow

  return {
    getStatus: (monitorId: MonitorId) =>
      Ref.get(statuses).pipe(Effect.map((current) => HashMap.get(current, monitorId))),
  } satisfies Interface
})

export const layer = Layer.effect(MonitorStatusService, make)
