import { Api, MonitorDefinition } from '@uptime-watchdog/common'
import { Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'
import { HttpApiClient } from 'effect/unstable/httpapi'
import { describe, expect, test } from 'vitest'

import { ApiClient } from './apiClient'
import { ListMonitors, RegisterMonitor } from './command'

const monitorJson = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  name: 'Prod API',
  request: {
    hostname: 'example.com',
    port: 443,
    protocol: 'https',
    method: 'GET',
    headers: {},
  },
  cronSchedule: '*/5 * * * *',
  expectedStatus: 200,
  createdAt: '2026-09-13T12:00:00.000Z',
}

const definition = Schema.decodeSync(MonitorDefinition)({
  name: 'Prod API',
  request: {
    hostname: 'example.com',
    port: 443,
    protocol: 'https',
    method: 'GET',
    headers: {},
  },
  cronSchedule: '*/5 * * * *',
  expectedStatus: 200,
})

const jsonResponse = (
  request: HttpClientRequest.HttpClientRequest,
  status: number,
  body: unknown,
) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

const clientLayer = (client: HttpClient.HttpClient) =>
  Layer.effect(ApiClient, HttpApiClient.make(Api, { baseUrl: 'http://test' })).pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )

const run = <A, E>(effect: Effect.Effect<A, E, ApiClient>, client: HttpClient.HttpClient) =>
  effect.pipe(Effect.provide(clientLayer(client)), Effect.runPromise)

describe('ListMonitors', () => {
  test('decodes the monitor list on success', async () => {
    const client = HttpClient.make((request) =>
      Effect.sync(() =>
        jsonResponse(request, 200, [{ monitor: monitorJson, health: { _tag: 'None' } }]),
      ),
    )

    const message = await run(ListMonitors().effect, client)

    expect(message._tag).toBe('CompletedListMonitors')
    if (message._tag === 'CompletedListMonitors') {
      expect(message.monitors).toHaveLength(1)
      expect(message.monitors[0]?.request.hostname).toBe('example.com')
    }
  })

  test('reports a failure when the request fails', async () => {
    const client = HttpClient.make((request) =>
      Effect.sync(() => jsonResponse(request, 500, { error: 'boom' })),
    )

    const message = await run(ListMonitors().effect, client)

    expect(message._tag).toBe('FailedListMonitors')
  })
})

describe('RegisterMonitor', () => {
  test('posts the definition and decodes the created monitor', async () => {
    let capturedMethod: string | undefined
    let capturedUrl: string | undefined

    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        capturedMethod = request.method
        capturedUrl = request.url
        return jsonResponse(request, 201, monitorJson)
      }),
    )

    const message = await run(RegisterMonitor({ definition }).effect, client)

    expect(capturedMethod).toBe('POST')
    expect(capturedUrl).toContain('/monitor')
    expect(message._tag).toBe('CompletedRegisterMonitor')
    if (message._tag === 'CompletedRegisterMonitor') {
      expect(message.monitor.id).toBe(monitorJson.id)
      expect(message.monitor.request.port).toBe(443)
    }
  })

  test('reports a failure when the server rejects the definition', async () => {
    const client = HttpClient.make((request) =>
      Effect.sync(() => jsonResponse(request, 400, { error: 'bad request' })),
    )

    const message = await run(RegisterMonitor({ definition }).effect, client)

    expect(message._tag).toBe('FailedRegisterMonitor')
  })
})
