import { Effect, Layer, Stream } from 'effect'
import { HttpStaticServer } from 'effect/http'
import * as Database from './Database'
import * as MonitorApi from './MonitorApi'
import * as MonitorDirectory from './MonitorDirectory'
import * as MonitorHealth from './MonitorHealth'
import * as MonitorRepository from './MonitorRepository'
import * as MonitorStreams from './MonitorStreams'
import * as NotificationTargetRepository from './NotificationTargetRepository'
import * as NotificationWorker from './NotificationWorker'
import * as WatchdogEvents from './WatchdogEvents'
import * as WatchdogRpc from './WatchdogRpc'

export interface Options {
  readonly databasePath: string
  readonly staticRoot: string
}

export const layer = (options: Options) => {
  const database = Database.layer(options.databasePath)
  const events = WatchdogEvents.layer
  const monitors = MonitorRepository.layer.pipe(Layer.provide(database))
  const targets = NotificationTargetRepository.layer.pipe(Layer.provide(database))
  const streams = MonitorStreams.layer.pipe(Layer.provide(events), Layer.provide(monitors))
  const health = MonitorHealth.layer.pipe(Layer.provide(streams), Layer.provide(events))
  const worker = NotificationWorker.layer.pipe(Layer.provide(events), Layer.provide(targets))
  const directory = MonitorDirectory.layer.pipe(Layer.provide(monitors), Layer.provide(targets), Layer.provide(events))
  const services = Layer.mergeAll(events, monitors, targets, streams, health, worker, directory)

  const observability = Layer.effectDiscard(
    Effect.gen(function* () {
      const monitorStreams = yield* MonitorStreams.MonitorStreams
      yield* Stream.runForEach(monitorStreams.observations, Effect.log).pipe(Effect.forkScoped)
    }),
  ).pipe(Layer.provide(streams))

  const routes = Layer.mergeAll(
    HttpStaticServer.layer({ root: options.staticRoot, spa: true }),
    MonitorApi.layer.pipe(Layer.provide(services)),
    WatchdogRpc.layer.pipe(Layer.provide(events)),
  )

  return Layer.mergeAll(routes, observability, services)
}
