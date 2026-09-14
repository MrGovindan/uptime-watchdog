import {
  Monitor,
  type MonitorId,
  type MonitorName,
  type MonitorObservation,
  type UptimeObservation,
} from '@uptime-watchdog/common'
import { Context, Effect, Layer, Schedule, Stream } from 'effect'
import * as CheckUptime from './CheckUptime'
import * as MonitorEvents from './MonitorEvents'
import { MonitorRepository } from './MonitorRepository'
import * as StreamRegistry from './StreamRegistry'

type RegistryValue = Readonly<{ monitorName: MonitorName; observation: UptimeObservation }>

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
      Effect.map((observation) => ({ monitorName: monitor.name, observation })),
    ),
    Schedule.cron(monitor.cronSchedule),
  ).pipe(Stream.orDie)

const make = Effect.gen(function* () {
  const repository = yield* MonitorRepository
  const events = yield* MonitorEvents.MonitorEvents
  const registry = yield* StreamRegistry.tag<MonitorId, RegistryValue>()
  const checkUptime = yield* CheckUptime.CheckUptime

  const start = Effect.fn('MonitorStreams.start')((monitor: Monitor) =>
    registry.add(monitor.id, createMonitorStream(monitor, checkUptime)),
  )

  // Subscribe before loading so a monitor created during startup is not missed.
  yield* events.stream.pipe(
    Stream.runForEach((event) =>
      MonitorEvents.MonitorEvent.match(event, {
        MonitorRegistered: ({ monitor }) => start(monitor),
      }),
    ),
    Effect.forkScoped,
  )

  const monitors = yield* repository.list
  yield* Effect.forEach(monitors, start, { discard: true })

  return {
    start,
    observations: registry.stream.pipe(
      Stream.map(([monitorId, { monitorName, observation }]) => ({
        monitorId,
        monitorName,
        observation,
      })),
    ),
  } satisfies Interface
})

export const layer = Layer.effect(MonitorStreams, make).pipe(
  Layer.provide(StreamRegistry.layer<MonitorId, RegistryValue>()),
)
