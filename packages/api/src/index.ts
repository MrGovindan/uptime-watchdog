import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { Context, Effect, Layer, pipe, Schedule, Stream } from 'effect'
import { HttpRouter, HttpStaticServer } from 'effect/unstable/http'
import * as CheckUptime from './CheckUptime'
import * as AppConfig from './Config'
import { type ServiceMonitorConfiguration } from './Types'

class ServiceConfigurationSource extends Context.Service<
  ServiceConfigurationSource,
  ServiceMonitorConfiguration[]
>()('ServiceConfigurationSource') {
  static layerStatic = Layer.succeed(ServiceConfigurationSource, [])
}

const uptimeChecker = Effect.gen(function* () {
  const serviceConfigurations = yield* ServiceConfigurationSource
  const checkUptime = yield* CheckUptime.CheckUptime

  const stream = Stream.mergeAll({ concurrency: 'unbounded' })(
    serviceConfigurations.map((configuration) =>
      createServiceMonitorStream(configuration, checkUptime),
    ),
  )

  yield* Stream.runForEach(stream, Effect.log)
}).pipe(
  Effect.provide(CheckUptime.layer),
  Effect.provide(ServiceConfigurationSource.layerStatic),
  Effect.provide(BunHttpClient.layer),
)

const createServiceMonitorStream = (
  configuration: ServiceMonitorConfiguration,
  checkUptime: CheckUptime.Interface,
) =>
  pipe(
    Stream.fromEffectSchedule(
      checkUptime(configuration.requestConfiguration),
      Schedule.cron(configuration.cronSchedule),
    ),
    Stream.map((observation) => ({ serviceId: configuration.serviceId, observation })),
  )

const staticServer = Layer.unwrap(
  Effect.gen(function* () {
    const { port, staticRoot } = yield* AppConfig.server
    const webApp = HttpStaticServer.layer({ root: staticRoot, spa: true })
    return HttpRouter.serve(webApp).pipe(Layer.provide(BunHttpServer.layer({ port })))
  }),
)

const checker = Layer.effectDiscard(Effect.forkScoped(uptimeChecker))

BunRuntime.runMain(Layer.launch(Layer.mergeAll(staticServer, checker)))
