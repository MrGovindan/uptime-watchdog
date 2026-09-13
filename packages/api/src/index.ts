import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer, Stream } from 'effect'
import { HttpRouter, HttpStaticServer } from 'effect/unstable/http'
import * as CheckUptime from './CheckUptime'
import * as AppConfig from './Config'
import * as Database from './Database'
import * as MonitorApi from './MonitorApi'
import * as MonitorEvents from './MonitorEvents'
import * as MonitorRepository from './MonitorRepository'
import * as MonitorStreams from './MonitorStreams'

const application = Layer.unwrap(
  Effect.gen(function* () {
    const { port, staticRoot, databasePath } = yield* AppConfig.server

    const database = Database.layer(databasePath)
    const events = MonitorEvents.layer
    const repository = MonitorRepository.layer.pipe(Layer.provide(events), Layer.provide(database))
    const streams = MonitorStreams.layer.pipe(
      Layer.provide(events),
      Layer.provide(repository),
      Layer.provide(CheckUptime.layer),
      Layer.provide(BunHttpClient.layer),
    )

    const api = MonitorApi.layer.pipe(Layer.provide(repository), Layer.provide(database))
    const webApp = HttpStaticServer.layer({ root: staticRoot, spa: true })
    const served = HttpRouter.serve(Layer.mergeAll(webApp, api)).pipe(
      Layer.provide(BunHttpServer.layer({ port })),
    )

    // Building the streams layer subscribes to monitor events and starts the
    // saved monitors, so sequence it before the server accepts requests.
    const server = streams.pipe(Layer.flatMap(() => served))

    const logging = Layer.effectDiscard(
      Effect.gen(function* () {
        const monitorStreams = yield* MonitorStreams.MonitorStreams
        yield* Stream.runForEach(monitorStreams.observations, Effect.log)
      }),
    ).pipe(Layer.provide(streams))

    return Layer.merge(server, logging)
  }),
)

BunRuntime.runMain(Layer.launch(application))
