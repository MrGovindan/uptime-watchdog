import { Api, MonitorId, NotificationWindowDefinition } from '@uptime-watchdog/common'
import { Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'
import { describe, expect, test } from 'vitest'

import { ApiClient } from '../apiClient'
import { UpdateNotificationTargetWindow } from './command'

const monitorId = Schema.decodeSync(MonitorId)('3f2504e0-4f89-41d3-9a0c-0305e82c3301')

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

const window = Schema.decodeSync(NotificationWindowDefinition)({
  timezone: 'Europe/London',
  days: ['Monday', 'Tuesday'],
  startTime: '07:00',
  endTime: '17:00',
})

const run = (client: HttpClient.HttpClient) =>
  UpdateNotificationTargetWindow({
    monitorId,
    mattermostUserId: 'mm-jesse',
    window,
  }).effect.pipe(Effect.provide(clientLayer(client)), Effect.runPromise)

describe('UpdateNotificationTargetWindow', () => {
  test('decodes the updated target on success', async () => {
    const message = await run(
      HttpClient.make((request) =>
        Effect.sync(() =>
          respondWith(request, 200, {
            monitorId,
            mattermostUserId: 'mm-jesse',
            mattermostUsername: 'jesse',
            mattermostDisplayName: 'Jesse Duffield',
            window,
            createdAt: '2026-09-14T00:00:00.000Z',
          }),
        ),
      ),
    )

    expect(message._tag).toBe('CompletedUpdateNotificationTargetWindow')
    if (message._tag === 'CompletedUpdateNotificationTargetWindow') {
      expect(message.target.mattermostUserId).toBe('mm-jesse')
      expect(message.target.window).toMatchObject(window)
    }
  })

  test('reports a missing notification target with a readable error', async () => {
    const message = await run(
      HttpClient.make((request) =>
        Effect.sync(() =>
          respondWith(request, 404, {
            _tag: 'NotificationTargetNotFound',
            monitorId,
            mattermostUserId: 'mm-jesse',
          }),
        ),
      ),
    )

    expect(message._tag).toBe('FailedUpdateNotificationTargetWindow')
    if (message._tag === 'FailedUpdateNotificationTargetWindow') {
      expect(message.error).toBe('Mattermost user mm-jesse is not a notification target for this monitor')
    }
  })
})
