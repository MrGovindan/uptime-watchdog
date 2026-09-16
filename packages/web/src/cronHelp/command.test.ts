import { Api } from '@uptime-watchdog/common'
import { Effect, Layer } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'
import { HttpApiClient } from 'effect/unstable/httpapi'
import { describe, expect, test } from 'vitest'

import { ApiClient } from '../apiClient'
import { ConvertCronDescription } from './command'

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
  ConvertCronDescription({ description: 'every weekday at 9am' }).effect.pipe(
    Effect.provide(clientLayer(client)),
    Effect.runPromise,
  )

describe('ConvertCronDescription', () => {
  test('reports the converted cron expression', async () => {
    const message = await run(
      HttpClient.make((request) =>
        Effect.sync(() => respondWith(request, 200, { cron: '0 9 * * 1-5' })),
      ),
    )

    expect(message._tag).toBe('CompletedConvertCronDescription')
    if (message._tag === 'CompletedConvertCronDescription') {
      expect(message.cron).toBe('0 9 * * 1-5')
    }
  })

  test('reports an unavailable provider as retryable', async () => {
    const message = await run(
      HttpClient.make((request) =>
        Effect.sync(() =>
          respondWith(request, 502, { _tag: 'ProviderUnavailable', message: 'provider is down' }),
        ),
      ),
    )

    expect(message._tag).toBe('FailedConvertCronDescription')
    if (message._tag === 'FailedConvertCronDescription') {
      expect(message.failure._tag).toBe('Unavailable')
    }
  })

  test('reports exhausted tokens', async () => {
    const message = await run(
      HttpClient.make((request) =>
        Effect.sync(() => respondWith(request, 429, { _tag: 'TokensExhausted' })),
      ),
    )

    expect(message._tag).toBe('FailedConvertCronDescription')
    if (message._tag === 'FailedConvertCronDescription') {
      expect(message.failure._tag).toBe('TokensExhausted')
    }
  })

  test('reports an unconvertible description', async () => {
    const message = await run(
      HttpClient.make((request) =>
        Effect.sync(() =>
          respondWith(request, 422, {
            _tag: 'DescriptionNotConvertible',
            description: 'every blue moon',
            message: 'not convertible',
          }),
        ),
      ),
    )

    expect(message._tag).toBe('FailedConvertCronDescription')
    if (message._tag === 'FailedConvertCronDescription') {
      expect(message.failure._tag).toBe('NotConvertible')
    }
  })

  test('reports unexpected errors', async () => {
    const message = await run(
      HttpClient.make((request) =>
        Effect.sync(() => respondWith(request, 500, { message: 'boom' })),
      ),
    )

    expect(message._tag).toBe('FailedConvertCronDescription')
    if (message._tag === 'FailedConvertCronDescription') {
      expect(message.failure._tag).toBe('Unexpected')
    }
  })
})
