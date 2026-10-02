import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'
import { HttpClient, HttpClientRequest, HttpRouter } from 'effect/http'
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai-compat'
import * as CheckUptime from './CheckUptime'
import * as AppConfig from './Config'
import * as CronConversion from './CronConversion'
import * as Mattermost from './Mattermost'
import * as Watchdog from './Watchdog'

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

    const checkUptime = CheckUptime.layer.pipe(Layer.provide(BunHttpClient.layer))
    const mattermost = Mattermost.layer(mattermostConfig)
    const cronConversion = CronConversion.layer.pipe(Layer.provide(lm), Layer.provide(BunHttpClient.layer))

    return HttpRouter.serve(Watchdog.layer({ databasePath, staticRoot })).pipe(
      Layer.provide(Layer.mergeAll(checkUptime, mattermost, cronConversion)),
      Layer.provide(BunHttpServer.layer({ port })),
    )
  }),
)

BunRuntime.runMain(Layer.launch(application))
