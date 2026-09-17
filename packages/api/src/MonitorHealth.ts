import type { Monitor, MonitorHealth as MonitorHealthState } from '@uptime-watchdog/common'
import { type MonitorId, toMonitorHealth } from '@uptime-watchdog/common'
import { Context, Effect, HashMap, Layer, Option, Ref, Stream } from 'effect'
import * as MonitorStreams from './MonitorStreams'
import { WatchdogEvent } from '@uptime-watchdog/common'
import { WatchdogEvents } from './WatchdogEvents'

export interface Interface {
  readonly getHealth: (monitorId: MonitorId) => Effect.Effect<Option.Option<MonitorHealthState>>
}

export class MonitorHealth extends Context.Service<MonitorHealth, Interface>()('MonitorHealth') {}

const healthEvent = (monitor: Monitor, health: MonitorHealthState): WatchdogEvent =>
  health._tag === 'Healthy'
    ? { _tag: 'MonitorHealthy', monitor, health }
    : { _tag: 'MonitorDegraded', monitor, health }

const make = Effect.gen(function* () {
  const streams = yield* MonitorStreams.MonitorStreams
  const events = yield* WatchdogEvents
  const healths = yield* Ref.make(HashMap.empty<MonitorId, MonitorHealthState>())

  yield* streams.observations.pipe(
    Stream.runForEach((observed) =>
      Effect.gen(function* () {
        const health = toMonitorHealth(observed.observation, observed.monitor.expectedStatus)
        yield* Ref.update(healths, (current) => HashMap.set(current, observed.monitor.id, health))
        yield* events.publish(healthEvent(observed.monitor, health))
      }),
    ),
    Effect.forkScoped,
  )
  yield* Effect.yieldNow

  yield* events.stream.pipe(
    Stream.runForEach((event) =>
      WatchdogEvent.match(event, {
        MonitorDeleted: ({ monitor }) =>
          Ref.update(healths, (current) => HashMap.remove(current, monitor.id)),
        MonitorRegistered: () => Effect.void,
        MonitorUpdated: () => Effect.void,
        NotificationTargetAdded: () => Effect.void,
        NotificationTargetRemoved: () => Effect.void,
        MonitorHealthy: () => Effect.void,
        MonitorDegraded: () => Effect.void,
      }),
    ),
    Effect.forkScoped,
  )
  yield* Effect.yieldNow

  return {
    getHealth: (monitorId: MonitorId) =>
      Ref.get(healths).pipe(Effect.map((current) => HashMap.get(current, monitorId))),
  } satisfies Interface
})

export const layer = Layer.effect(MonitorHealth, make)
