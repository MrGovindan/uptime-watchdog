import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Monitor } from '@uptime-watchdog/common'
import { Context, Cron, Effect, Layer, pipe, Result, Schedule, Stream } from 'effect'
import { HttpRouter, HttpStaticServer } from 'effect/unstable/http'
import * as CheckUptime from './CheckUptime'
import * as AppConfig from './Config'
import * as Database from './Database'
import * as MonitorApi from './MonitorApi'
import * as MonitorRepository from './MonitorRepository'

class MonitorSource extends Context.Service<MonitorSource, ReadonlyArray<Monitor>>()(
  'MonitorSource',
) {
  static layerStatic = Layer.succeed(MonitorSource, [])
}

const uptimeChecker = Effect.gen(function* () {
  const monitors = yield* MonitorSource
  const checkUptime = yield* CheckUptime.CheckUptime

  const stream = Stream.mergeAll({ concurrency: 'unbounded' })(
    monitors.map((monitor) => createMonitorStream(monitor, checkUptime)),
  )

  yield* Stream.runForEach(stream, Effect.log)
}).pipe(
  Effect.provide(CheckUptime.layer),
  Effect.provide(MonitorSource.layerStatic),
  Effect.provide(BunHttpClient.layer),
)

const createMonitorStream = (monitor: Monitor, checkUptime: CheckUptime.Interface) =>
  pipe(
    Stream.fromEffectSchedule(
      checkUptime(monitor.request),
      Schedule.cron(Result.getOrThrow(Cron.parse(monitor.cronSchedule))),
    ),
    Stream.map((observation) => ({ monitorId: monitor.id, observation })),
  )

const application = Layer.unwrap(
  Effect.gen(function* () {
    const { port, staticRoot, databasePath } = yield* AppConfig.server

    const database = Database.layer(databasePath)

    const api = MonitorApi.layer.pipe(
      Layer.provide(MonitorRepository.layer),
      Layer.provide(database),
    )

    const webApp = HttpStaticServer.layer({ root: staticRoot, spa: true })

    return HttpRouter.serve(Layer.mergeAll(webApp, api)).pipe(
      Layer.provide(BunHttpServer.layer({ port })),
    )
  }),
)

const checker = Layer.effectDiscard(Effect.forkScoped(uptimeChecker))

BunRuntime.runMain(Layer.launch(Layer.mergeAll(application, checker)))
