import { Layer } from 'effect'

import { layer as apiClientLayer } from './apiClient'
import { WatchdogRpcClient } from './rpcClient'

export const Resources = Layer.mergeAll(apiClientLayer, WatchdogRpcClient.layer)
export type ResourcesType = Layer.Success<typeof Resources>
