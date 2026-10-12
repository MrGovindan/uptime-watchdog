import { Schema } from 'effect'
import { Model } from 'effect/schema'
import { MattermostUserId, MattermostUsername } from './Mattermost'
import { MonitorId } from './Monitor'
import { NotificationWindow, NotificationWindowDefinition } from './NotificationWindow'

export const NotificationWindowColumn = Schema.NullOr(Schema.fromJsonString(NotificationWindow))

export class NotificationTarget extends Model.Class<NotificationTarget>('NotificationTarget')({
  monitorId: MonitorId,
  mattermostUserId: MattermostUserId,
  mattermostUsername: MattermostUsername,
  mattermostDisplayName: Schema.String,
  window: Model.Field({
    select: NotificationWindowColumn,
    insert: NotificationWindowColumn,
    update: NotificationWindowColumn,
    json: Schema.NullOr(NotificationWindow),
    jsonCreate: Schema.NullOr(NotificationWindow),
    jsonUpdate: Schema.NullOr(NotificationWindow),
  }),
  createdAt: Model.DateTimeInsert,
}) {}

export const NotificationTargetDefinition = Schema.Struct({
  mattermostUserId: MattermostUserId,
  window: Schema.optional(NotificationWindowDefinition),
})
export type NotificationTargetDefinition = typeof NotificationTargetDefinition.Type

export const NotificationTargetWindowDefinition = Schema.Struct({
  window: Schema.NullOr(NotificationWindowDefinition),
})
export type NotificationTargetWindowDefinition = typeof NotificationTargetWindowDefinition.Type
