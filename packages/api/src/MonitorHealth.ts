import type { Monitor, MonitorHealth as MonitorHealthState } from '@uptime-watchdog/common'
import { type MonitorId, toMonitorHealth } from '@uptime-watchdog/common'
import { Context, Effect, HashMap, Layer, Option, Ref, Stream } from 'effect'
import * as MonitorStreams from './MonitorStreams'
import { WatchdogEvent, WatchdogEvents } from './WatchdogEvents'

export interface Interface {
  readonly getHealth: (monitorId: MonitorId) => Effect.Effect<Option.Option<MonitorHealthState>>
}

export class MonitorHealth extends Context.Service<MonitorHealth, Interface>()('MonitorHealth') {}

const transitionEvent = (
  previousTag: Option.Option<MonitorHealthState['_tag']>,
  monitor: Monitor,
  health: MonitorHealthState,
): Option.Option<WatchdogEvent> =>
  Option.match(previousTag, {
    onNone: () =>
      health._tag === 'Healthy'
        ? Option.some<WatchdogEvent>({ _tag: 'MonitorHealthy', monitor, health })
        : Option.some({ _tag: 'MonitorDegraded', monitor, health }),
    onSome: (previous) => {
      if (previous === health._tag) return Option.none()
      if (previous === 'Healthy') {
        return Option.some<WatchdogEvent>({ _tag: 'MonitorDegraded', monitor, health })
      }
      return Option.some<WatchdogEvent>({ _tag: 'MonitorHealed', monitor, health })
    },
  })

const make = Effect.gen(function* () {
  const streams = yield* MonitorStreams.MonitorStreams
  const events = yield* WatchdogEvents
  const healths = yield* Ref.make(HashMap.empty<MonitorId, MonitorHealthState>())

  yield* streams.observations.pipe(
    Stream.runForEach((observed) =>
      Ref.modify(healths, (current) => {
        const health = toMonitorHealth(observed.observation, observed.monitor.expectedStatus)
        const previousTag = Option.map(HashMap.get(current, observed.monitor.id), (h) => h._tag)
        const event = transitionEvent(previousTag, observed.monitor, health)
        return [event, HashMap.set(current, observed.monitor.id, health)]
      }).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.void,
            onSome: (event) => events.publish(event),
          }),
        ),
      ),
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
        MonitorHealed: () => Effect.void,
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
