import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer, Stream } from 'effect'
import { HttpRouter, HttpStaticServer } from 'effect/unstable/http'
import * as CheckUptime from './CheckUptime'
import * as AppConfig from './Config'
import * as Database from './Database'
import * as Mattermost from './Mattermost'
import * as MonitorApi from './MonitorApi'
import * as MonitorRepository from './MonitorRepository'
import * as MonitorStreams from './MonitorStreams'
import * as NotificationTargetRepository from './NotificationTargetRepository'
import * as NotificationWorker from './NotificationWorker'
import * as WatchdogEvents from './WatchdogEvents'

const application = Layer.unwrap(
  Effect.gen(function* () {
    const { port, staticRoot, databasePath } = yield* AppConfig.server
    const mattermostConfig = yield* AppConfig.mattermost

    const database = Database.layer(databasePath)
    const events = WatchdogEvents.layer
    const repository = MonitorRepository.layer.pipe(Layer.provide(events), Layer.provide(database))
    const targets = NotificationTargetRepository.layer.pipe(Layer.provide(database))
    const mattermost = Mattermost.layer(mattermostConfig)

    const streams = MonitorStreams.layer.pipe(
      Layer.provide(events),
      Layer.provide(repository),
      Layer.provide(CheckUptime.layer),
      Layer.provide(BunHttpClient.layer),
    )

    const worker = NotificationWorker.layer.pipe(Layer.provide(events), Layer.provide(mattermost))

    const api = MonitorApi.layer.pipe(
      Layer.provide(events),
      Layer.provide(repository),
      Layer.provide(targets),
      Layer.provide(mattermost),
    )
    const webApp = HttpStaticServer.layer({ root: staticRoot, spa: true })
    const served = HttpRouter.serve(Layer.mergeAll(webApp, api)).pipe(
      Layer.provide(BunHttpServer.layer({ port })),
    )

    // Building the streams and worker layers subscribes them to the event bus,
    // so sequence them before the server accepts requests.
    const background = Layer.merge(streams, worker)
    const server = background.pipe(Layer.flatMap(() => served))

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
