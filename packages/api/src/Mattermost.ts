import { BunHttpClient } from '@effect/platform-bun'
import {
  type MattermostUser,
  type MattermostUserId,
  MattermostUnavailable,
  MattermostUserNotFound,
} from '@uptime-watchdog/common'
import { Array, Context, Effect, Layer, type Redacted } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { HttpApiClient } from 'effect/unstable/httpapi'
import * as MattermostApi from './MattermostApi'

const SEARCH_LIMIT = 20

type MattermostError = Readonly<{ _tag: string; message?: string | undefined }>

export interface Interface {
  readonly searchUsers: (
    term: string,
  ) => Effect.Effect<ReadonlyArray<MattermostUser>, MattermostUnavailable>
  readonly getUser: (
    userId: MattermostUserId,
  ) => Effect.Effect<MattermostUser, MattermostUserNotFound | MattermostUnavailable>
  readonly sendDirectMessage: (
    userId: MattermostUserId,
    message: string,
  ) => Effect.Effect<void, MattermostUserNotFound | MattermostUnavailable>
}

export class Mattermost extends Context.Service<Mattermost, Interface>()('Mattermost') {}

const describe = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error
    return typeof message === 'string' ? message : String(error)
  }

  return String(error)
}

const unavailable = (error: unknown): MattermostUnavailable =>
  new MattermostUnavailable({ message: describe(error) })

const userNotFound = (userId: MattermostUserId): MattermostUserNotFound =>
  new MattermostUserNotFound({ mattermostUserId: userId })

const isMissingUser = (error: MattermostError): boolean => error._tag === 'MattermostNotFound'

const isRejectedToken = (error: MattermostError): boolean =>
  error._tag === 'MattermostUnauthorized' || error._tag === 'MattermostForbidden'

const displayNameOf = (user: MattermostApi.User): string => {
  const name = Array.filter(
    [user.first_name, user.last_name],
    (part): part is string => part !== undefined && part.trim() !== '',
  ).join(' ')

  if (name !== '') {
    return name
  }

  return user.nickname === undefined || user.nickname.trim() === '' ? user.username : user.nickname
}

const isSelectable = (user: MattermostApi.User): boolean =>
  user.is_bot !== true && (user.delete_at ?? 0) === 0

const toProjection = (user: MattermostApi.User): MattermostUser => ({
  id: user.id,
  username: user.username,
  displayName: displayNameOf(user),
})

export const make = (options: Readonly<{ baseUrl: URL; apiToken: Redacted.Redacted }>) =>
  Effect.gen(function* () {
    const baseUrl = new URL('api/v4', `${options.baseUrl.toString().replace(/\/$/, '')}/`)

    const client = yield* HttpApiClient.make(MattermostApi.Api, {
      baseUrl: baseUrl.toString(),
      transformClient: (httpClient) =>
        httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.bearerToken(options.apiToken))),
    })

    const fetchBotId = yield* Effect.cached(
      client.users.getUser({ params: { userId: 'me' } }).pipe(
        Effect.map(({ id }) => id),
        Effect.mapError((error) => unavailable(error)),
      ),
    )

    const fetchUser = (
      userId: MattermostUserId,
    ): Effect.Effect<MattermostApi.User, MattermostUserNotFound | MattermostUnavailable> =>
      client.users
        .getUser({ params: { userId } })
        .pipe(
          Effect.mapError((error) =>
            isMissingUser(error) ? userNotFound(userId) : unavailable(error),
          ),
        )

    const getUser = Effect.fn('Mattermost.getUser')(function* (userId: MattermostUserId) {
      const user = yield* fetchUser(userId)
      return toProjection(user)
    })

    const searchUsers = Effect.fn('Mattermost.searchUsers')(function* (term: string) {
      const users = yield* client.users
        .searchUsers({ payload: { term, limit: SEARCH_LIMIT } })
        .pipe(Effect.mapError((error) => unavailable(error)))

      return Array.map(Array.filter(users, isSelectable), toProjection)
    })

    const sendDirectMessage = Effect.fn('Mattermost.sendDirectMessage')(function* (
      userId: MattermostUserId,
      message: string,
    ) {
      const botId = yield* fetchBotId

      const channel = yield* client.channels
        .createDirectChannel({ payload: [botId, userId] })
        .pipe(Effect.mapError((error) => unavailable(error)))

      yield* client.posts
        .createPost({ payload: { channel_id: channel.id, message } })
        .pipe(Effect.mapError((error) => unavailable(error)))
    })

    yield* client.users.getUser({ params: { userId: 'me' } }).pipe(
      Effect.tap(() => Effect.logInfo('Validated Mattermost API token')),
      Effect.catch((error) => {
        if (isRejectedToken(error)) {
          return Effect.die(
            new Error(
              'MATTERMOST_API_TOKEN was rejected by Mattermost. Check the configured token.',
            ),
          )
        }

        return Effect.logWarning(
          `Mattermost was unreachable at startup; notifications may fail: ${describe(error)}`,
        )
      }),
    )

    return { searchUsers, getUser, sendDirectMessage } satisfies Interface
  })

export const layer = (options: Readonly<{ baseUrl: URL; apiToken: Redacted.Redacted }>) =>
  Layer.effect(Mattermost, make(options)).pipe(Layer.provide(BunHttpClient.layer))
