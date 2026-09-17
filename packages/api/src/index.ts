import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer, Stream } from 'effect'
import { HttpClient, HttpClientRequest, HttpRouter, HttpStaticServer } from 'effect/unstable/http'
import * as CheckUptime from './CheckUptime'
import * as AppConfig from './Config'
import * as CronConversion from './CronConversion'
import * as Database from './Database'
import * as Mattermost from './Mattermost'
import * as MonitorApi from './MonitorApi'
import * as MonitorRepository from './MonitorRepository'
import * as MonitorHealth from './MonitorHealth'
import * as MonitorStreams from './MonitorStreams'
import * as NotificationTargetRepository from './NotificationTargetRepository'
import * as NotificationWorker from './NotificationWorker'
import * as WatchdogEvents from './WatchdogEvents'
import * as WatchdogRpc from './WatchdogRpc'
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai-compat'

const application = Layer.unwrap(
  Effect.gen(function* () {
    const { port, staticRoot, databasePath } = yield* AppConfig.Server
    const mattermostConfig = yield* AppConfig.Mattermost
    const openCode = yield* AppConfig.OpenCode

    const lm = OpenAiLanguageModel.layer({
      model: openCode.model,
      config: {
        temperature: 0,
        reasoning: { effort: 'minimal' },
      },
    }).pipe(
      Layer.provide(
        OpenAiClient.layer({
          apiKey: openCode.apiKey,
          apiUrl: `${openCode.url}`,
          transformClient: (client) =>
            HttpClient.mapRequestInput(client, (request) =>
              HttpClientRequest.setHeader(request, 'x-opencode-session', crypto.randomUUID()),
            ),
        }),
      ),
    )

    const database = Database.layer(databasePath)
    const events = WatchdogEvents.layer
    const monitorRespository = MonitorRepository.layer.pipe(Layer.provide(database))
    const targetRepository = NotificationTargetRepository.layer.pipe(Layer.provide(database))
    const mattermost = Mattermost.layer(mattermostConfig)
    const scheduleModel = CronConversion.layer.pipe(
      Layer.provide(lm),
      Layer.provide(BunHttpClient.layer),
    )

    const streams = MonitorStreams.layer.pipe(
      Layer.provide(events),
      Layer.provide(monitorRespository),
      Layer.provide(CheckUptime.layer),
      Layer.provide(BunHttpClient.layer),
    )
    const worker = NotificationWorker.layer.pipe(
      Layer.provide(events),
      Layer.provide(mattermost),
      Layer.provide(targetRepository),
    )
    const status = MonitorHealth.layer.pipe(Layer.provide(streams), Layer.provide(events))

    const api = MonitorApi.layer.pipe(
      Layer.provide(
        Layer.mergeAll(events, monitorRespository, targetRepository, mattermost, scheduleModel),
      ),
      Layer.provide(status),
    )
    const webApp = HttpStaticServer.layer({ root: staticRoot, spa: true })
    // The RPC socket streams the same bus the API publishes to, so provide the
    // one shared `events` layer instead of building a second instance.
    const rpc = WatchdogRpc.layer.pipe(Layer.provide(events))
    const served = HttpRouter.serve(Layer.mergeAll(webApp, api, rpc)).pipe(
      Layer.provide(BunHttpServer.layer({ port })),
    )

    // Building the streams and worker layers subscribes them to the event bus,
    // so sequence them before the server accepts requests.
    const background = Layer.mergeAll(streams, worker, status)
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
