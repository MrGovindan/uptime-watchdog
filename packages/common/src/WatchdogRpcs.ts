import * as Rpc from 'effect/rpc/Rpc'
import * as RpcGroup from 'effect/rpc/RpcGroup'

import { WatchdogEvent } from './WatchdogEvent'

export const WATCHDOG_RPC_PATH = '/rpc'

export const Events = Rpc.make('events', {
  success: WatchdogEvent,
  stream: true,
})

export const WatchdogRpcs = RpcGroup.make(Events)
