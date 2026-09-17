import * as Rpc from 'effect/unstable/rpc/Rpc'
import * as RpcGroup from 'effect/unstable/rpc/RpcGroup'

import { WatchdogEvent } from './WatchdogEvent'

export const WATCHDOG_RPC_PATH = '/rpc'

export const Events = Rpc.make('events', {
  success: WatchdogEvent,
  stream: true,
})

export const WatchdogRpcs = RpcGroup.make(Events)
