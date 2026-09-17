import { BrowserSocket } from '@effect/platform-browser'
import { WATCHDOG_RPC_PATH, WatchdogRpcs } from '@uptime-watchdog/common'
import { Context, Layer } from 'effect'
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc'

const makeWebSocketUrl = () => {
  const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${globalThis.location.host}${WATCHDOG_RPC_PATH}`
}

const protocol = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(BrowserSocket.layerWebSocket(makeWebSocketUrl())),
  Layer.provide(RpcSerialization.layerNdjson),
)

export class WatchdogRpcClient extends Context.Service<WatchdogRpcClient>()('WatchdogRpcClient', {
  make: RpcClient.make(WatchdogRpcs),
}) {
  static layer = Layer.effect(WatchdogRpcClient, WatchdogRpcClient.make).pipe(
    Layer.provide(protocol),
  )
}
