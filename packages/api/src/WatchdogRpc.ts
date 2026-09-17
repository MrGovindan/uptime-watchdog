import { WATCHDOG_RPC_PATH, WatchdogRpcs } from '@uptime-watchdog/common'
import { Effect, Layer } from 'effect'
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc'
import { WatchdogEvents } from './WatchdogEvents'

const handlers = WatchdogRpcs.toLayer(
  Effect.gen(function* () {
    const events = yield* WatchdogEvents

    return WatchdogRpcs.of({
      events: () => events.stream,
    })
  }),
)

export const layer = RpcServer.layerHttp({
  group: WatchdogRpcs,
  path: WATCHDOG_RPC_PATH,
  protocol: 'websocket',
}).pipe(Layer.provide(handlers), Layer.provide(RpcSerialization.layerNdjson))
