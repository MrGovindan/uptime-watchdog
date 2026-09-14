import { Api } from '@uptime-watchdog/common'
import { Effect, Layer } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'
import { HttpApiClient } from 'effect/unstable/httpapi'
import { describe, expect, test } from 'vitest'

import { ApiClient } from '../apiClient'
import { SendTestNotification } from './command'

const clientLayer = (client: HttpClient.HttpClient) =>
  Layer.effect(ApiClient, HttpApiClient.make(Api, { baseUrl: 'http://test' })).pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )

const respondWith = (request: HttpClientRequest.HttpClientRequest, status: number, body: unknown) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

const run = (client: HttpClient.HttpClient) =>
  SendTestNotification({ mattermostUserId: 'mm-jesse', monitorId: undefined }).effect.pipe(
    Effect.provide(clientLayer(client)),
    Effect.runPromise,
  )

describe('SendTestNotification', () => {
  test('reports a missing mattermost user with a readable error', async () => {
    const message = await run(
      HttpClient.make((request) =>
        Effect.sync(() =>
          respondWith(request, 404, {
            _tag: 'MattermostUserNotFound',
            mattermostUserId: 'mm-jesse',
          }),
        ),
      ),
    )

    expect(message._tag).toBe('FailedSendTestNotification')
    if (message._tag === 'FailedSendTestNotification') {
      expect(message.error).toBe('Mattermost user mm-jesse was not found')
    }
  })

  test('reports an unavailable mattermost with its message', async () => {
    const message = await run(
      HttpClient.make((request) =>
        Effect.sync(() =>
          respondWith(request, 502, {
            _tag: 'MattermostUnavailable',
            message: 'Mattermost is down',
          }),
        ),
      ),
    )

    expect(message._tag).toBe('FailedSendTestNotification')
    if (message._tag === 'FailedSendTestNotification') {
      expect(message.error).toBe('Mattermost is down')
    }
  })
})
