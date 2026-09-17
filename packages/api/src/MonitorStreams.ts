import {
  Monitor,
  type MonitorId,
  type MonitorObservation,
  type UptimeObservation,
} from '@uptime-watchdog/common'
import { Context, Effect, Layer, Schedule, Stream } from 'effect'
import * as CheckUptime from './CheckUptime'
import { MonitorRepository } from './MonitorRepository'
import * as StreamRegistry from './StreamRegistry'
import { WatchdogEvent } from '@uptime-watchdog/common'
import { WatchdogEvents } from './WatchdogEvents'

type RegistryValue = Readonly<{ monitor: Monitor; observation: UptimeObservation }>

export interface Interface {
  readonly start: (monitor: Monitor) => Effect.Effect<void>
  readonly observations: Stream.Stream<MonitorObservation>
}

export class MonitorStreams extends Context.Service<MonitorStreams, Interface>()(
  'MonitorStreams',
) {}

const createMonitorStream = (monitor: Monitor, checkUptime: CheckUptime.Interface) =>
  Stream.fromEffectSchedule(
    checkUptime(monitor.request).pipe(
      Effect.annotateSpans({ 'monitor.name': monitor.name, 'monitor.id': monitor.id }),
      Effect.annotateLogs({ monitor: monitor.name }),
      Effect.map((observation) => ({ monitor, observation })),
    ),
    Schedule.cron(monitor.cronSchedule),
  ).pipe(Stream.orDie)

const make = Effect.gen(function* () {
  const repository = yield* MonitorRepository
  const events = yield* WatchdogEvents
  const registry = yield* StreamRegistry.tag<MonitorId, RegistryValue>()
  const checkUptime = yield* CheckUptime.CheckUptime

  const start = Effect.fn('MonitorStreams.start')((monitor: Monitor) =>
    registry.add(monitor.id, createMonitorStream(monitor, checkUptime)),
  )

  // Subscribe before loading so a monitor created during startup is not missed.
  yield* events.stream.pipe(
    Stream.runForEach((event) =>
      WatchdogEvent.match(event, {
        MonitorRegistered: ({ monitor }) => start(monitor),
        MonitorUpdated: ({ monitor }) => start(monitor),
        MonitorDeleted: ({ monitor }) => registry.remove(monitor.id),
        NotificationTargetAdded: () => Effect.void,
        NotificationTargetRemoved: () => Effect.void,
        MonitorHealthy: () => Effect.void,
        MonitorDegraded: () => Effect.void,
      }),
    ),
    Effect.forkScoped,
  )

  const monitors = yield* repository.list
  yield* Effect.forEach(monitors, start, { discard: true })

  return {
    start,
    observations: registry.stream.pipe(Stream.map(([, value]) => value)),
  } satisfies Interface
})

export const layer = Layer.effect(MonitorStreams, make).pipe(
  Layer.provide(StreamRegistry.layer<MonitorId, RegistryValue>()),
)
