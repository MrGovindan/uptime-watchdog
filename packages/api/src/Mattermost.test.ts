import { MattermostUserNotFound } from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Exit, Layer, Redacted, Ref } from 'effect'
import {
  type HttpClientRequest,
  HttpClient,
  HttpClientError,
  HttpClientResponse,
} from 'effect/unstable/http'
import * as Mattermost from './Mattermost'

const options = {
  baseUrl: new URL('https://mattermost.test'),
  apiToken: Redacted.make('secret'),
}

const bot = {
  id: 'bot-1',
  username: 'watchdog',
  first_name: 'Watch',
  last_name: 'Dog',
  is_bot: true,
  delete_at: 0,
}

type Handler = (
  request: HttpClientRequest.HttpClientRequest,
) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>

const jsonResponse = (
  request: HttpClientRequest.HttpClientRequest,
  body: unknown,
  status = 200,
): Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError> =>
  Effect.succeed(
    HttpClientResponse.fromWeb(
      request,
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )

const bodyOf = (request: HttpClientRequest.HttpClientRequest): string => {
  const body = request.body

  if (body._tag !== 'Uint8Array') {
    return ''
  }

  return body.text ?? new TextDecoder().decode(body.body)
}

const serviceLayer = (handler: Handler) =>
  Layer.effect(Mattermost.Mattermost, Mattermost.make(options)).pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) => handler(request)),
      ),
    ),
  )

const me = (request: HttpClientRequest.HttpClientRequest) => jsonResponse(request, bot)

describe(Mattermost.Mattermost.name, () => {
  it.effect('maps a missing mattermost user to MattermostUserNotFound', () =>
    Effect.gen(function* () {
      const mattermost = yield* Mattermost.Mattermost

      const error = yield* mattermost.getUser('missing').pipe(Effect.flip)

      expect(error).toBeInstanceOf(MattermostUserNotFound)
    }).pipe(
      Effect.provide(
        serviceLayer((request) =>
          request.url.endsWith('/users/me')
            ? me(request)
            : jsonResponse(request, { message: 'not found' }, 404),
        ),
      ),
    ),
  )

  it.effect('searches users, dropping bots and deactivated accounts', () =>
    Effect.gen(function* () {
      const mattermost = yield* Mattermost.Mattermost

      const users = yield* mattermost.searchUsers('jes')

      expect(users).toEqual([{ id: 'user-1', username: 'jesse', displayName: 'Jesse Duffield' }])
    }).pipe(
      Effect.provide(
        serviceLayer((request) => {
          if (request.url.endsWith('/users/me')) {
            return me(request)
          }

          return jsonResponse(request, [
            {
              id: 'user-1',
              username: 'jesse',
              first_name: 'Jesse',
              last_name: 'Duffield',
            },
            { id: 'bot-2', username: 'alerts', is_bot: true },
            { id: 'user-2', username: 'gone', delete_at: 123 },
          ])
        }),
      ),
    ),
  )

  it.effect('opens a direct channel and posts the message', () => {
    const seen = Effect.runSync(
      Ref.make<ReadonlyArray<Readonly<{ method: string; url: string; body: string }>>>([]),
    )

    const handler: Handler = (request) =>
      Effect.gen(function* () {
        yield* Ref.update(seen, (entries) => [
          ...entries,
          { method: request.method, url: request.url, body: bodyOf(request) },
        ])

        if (request.url.endsWith('/users/me')) {
          return yield* me(request)
        }
        if (request.url.endsWith('/channels/direct')) {
          return yield* jsonResponse(request, { id: 'channel-1' }, 201)
        }
        return yield* jsonResponse(request, { id: 'post-1', channel_id: 'channel-1' }, 201)
      })

    return Effect.gen(function* () {
      const mattermost = yield* Mattermost.Mattermost

      yield* mattermost.sendDirectMessage('user-1', 'monitor is down')

      const requests = yield* Ref.get(seen)

      expect(
        requests.map(({ method, url, body }) => ({
          method,
          url: url.replace('/api/v4', ''),
          body: body === '' ? null : JSON.parse(body),
        })),
      ).toEqual([
        { method: 'GET', url: 'https://mattermost.test/users/me', body: null },
        { method: 'GET', url: 'https://mattermost.test/users/me', body: null },
        {
          method: 'POST',
          url: 'https://mattermost.test/channels/direct',
          body: ['bot-1', 'user-1'],
        },
        {
          method: 'POST',
          url: 'https://mattermost.test/posts',
          body: { channel_id: 'channel-1', message: 'monitor is down' },
        },
      ])
    }).pipe(Effect.provide(serviceLayer(handler)))
  })

  it.effect('fails fast when the token is rejected at startup', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        Mattermost.Mattermost.pipe(
          Effect.provide(
            serviceLayer((request) => jsonResponse(request, { message: 'unauthorized' }, 401)),
          ),
        ),
      )

      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )

  it.effect('tolerates an unreachable mattermost at startup', () =>
    Effect.gen(function* () {
      const mattermost = yield* Mattermost.Mattermost

      expect(mattermost).toBeDefined()
    }).pipe(
      Effect.provide(
        serviceLayer((request) =>
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                description: 'connection refused',
              }),
            }),
          ),
        ),
      ),
    ),
  )
})
