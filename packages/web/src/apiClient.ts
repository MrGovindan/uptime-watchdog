import { Api } from '@uptime-watchdog/common'
import { Context, Layer } from 'effect'
import { HttpApiClient } from 'effect/unstable/httpapi'
import { Http } from 'foldkit'

export type MonitorApiClient = HttpApiClient.ForApi<typeof Api>

export class ApiClient extends Context.Service<ApiClient, MonitorApiClient>()('ApiClient') {}

export const layer = Layer.effect(
  ApiClient,
  HttpApiClient.make(Api, { baseUrl: globalThis.location.origin }),
).pipe(Layer.provide(Http.layer))
