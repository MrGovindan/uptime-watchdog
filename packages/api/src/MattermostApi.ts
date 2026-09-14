import { Schema, SchemaGetter } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/unstable/httpapi'

const MattermostErrorBody = Schema.Struct({
  message: Schema.optional(Schema.String),
})

type MattermostErrorBody = typeof MattermostErrorBody.Type

const responseError = <const Tag extends string>(tag: Tag, status: number) =>
  MattermostErrorBody.pipe(
    Schema.decodeTo(
      Schema.Struct({
        _tag: Schema.Literal(tag),
        message: Schema.optional(Schema.String),
      }),
      {
        decode: SchemaGetter.transform<
          Readonly<{ _tag: Tag; message?: string | undefined }>,
          MattermostErrorBody
        >((body) => ({ _tag: tag, message: body.message })),
        encode: SchemaGetter.transform<
          Readonly<{ message?: string | undefined }>,
          Readonly<{ _tag: Tag; message?: string | undefined }>
        >((error) => ({ message: error.message })),
      },
    ),
    HttpApiSchema.status(status),
  )

export const MattermostBadRequest = responseError('MattermostBadRequest', 400)
export const MattermostUnauthorized = responseError('MattermostUnauthorized', 401)
export const MattermostForbidden = responseError('MattermostForbidden', 403)
export const MattermostNotFound = responseError('MattermostNotFound', 404)
export const MattermostConflict = responseError('MattermostConflict', 409)
export const MattermostTooLarge = responseError('MattermostTooLarge', 413)
export const MattermostTooManyRequests = responseError('MattermostTooManyRequests', 429)
export const MattermostInternalServerError = responseError('MattermostInternalServerError', 500)
export const MattermostNotImplemented = responseError('MattermostNotImplemented', 501)
export const MattermostBadGateway = responseError('MattermostBadGateway', 502)

export const MattermostErrors = [
  MattermostBadRequest,
  MattermostUnauthorized,
  MattermostForbidden,
  MattermostNotFound,
  MattermostConflict,
  MattermostTooLarge,
  MattermostTooManyRequests,
  MattermostInternalServerError,
  MattermostNotImplemented,
  MattermostBadGateway,
] as const

export const User = Schema.Struct({
  id: Schema.String,
  username: Schema.String,
  first_name: Schema.optional(Schema.String),
  last_name: Schema.optional(Schema.String),
  nickname: Schema.optional(Schema.String),
  is_bot: Schema.optional(Schema.Boolean),
  delete_at: Schema.optional(Schema.Number),
})
export type User = typeof User.Type

export const Channel = Schema.Struct({
  id: Schema.String,
})

export const Post = Schema.Struct({
  id: Schema.String,
  channel_id: Schema.String,
})

export const UserSearchPayload = Schema.Struct({
  term: Schema.String,
  limit: Schema.optional(Schema.Number),
})

export const CreateDirectChannelPayload = Schema.Array(Schema.String)

export const CreatePostPayload = Schema.Struct({
  channel_id: Schema.String,
  message: Schema.String,
})

const UserIdParams = Schema.Struct({ userId: Schema.String })

export const Api = HttpApi.make('Mattermost')
  .add(
    HttpApiGroup.make('users').add(
      HttpApiEndpoint.get('getUser', '/users/:userId', {
        params: UserIdParams,
        success: User,
        error: MattermostErrors,
      }),
      HttpApiEndpoint.post('searchUsers', '/users/search', {
        payload: UserSearchPayload,
        success: Schema.Array(User),
        error: MattermostErrors,
      }),
    ),
  )
  .add(
    HttpApiGroup.make('channels').add(
      HttpApiEndpoint.post('createDirectChannel', '/channels/direct', {
        payload: CreateDirectChannelPayload,
        success: Channel.pipe(HttpApiSchema.status(201)),
        error: MattermostErrors,
      }),
    ),
  )
  .add(
    HttpApiGroup.make('posts').add(
      HttpApiEndpoint.post('createPost', '/posts', {
        payload: CreatePostPayload,
        success: Post.pipe(HttpApiSchema.status(201)),
        error: MattermostErrors,
      }),
    ),
  )
