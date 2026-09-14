import { Schema } from 'effect'

export const MattermostUserId = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))
export type MattermostUserId = typeof MattermostUserId.Type

export const MattermostUsername = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))
export type MattermostUsername = typeof MattermostUsername.Type

export const MattermostSearchTerm = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))
export type MattermostSearchTerm = typeof MattermostSearchTerm.Type

export const MattermostUser = Schema.Struct({
  id: MattermostUserId,
  username: MattermostUsername,
  displayName: Schema.String,
})
export type MattermostUser = typeof MattermostUser.Type

export const MattermostUserSearchDefinition = Schema.Struct({
  term: MattermostSearchTerm,
})
export type MattermostUserSearchDefinition = typeof MattermostUserSearchDefinition.Type

export const MattermostTestDefinition = Schema.Struct({
  mattermostUserId: MattermostUserId,
})
export type MattermostTestDefinition = typeof MattermostTestDefinition.Type
