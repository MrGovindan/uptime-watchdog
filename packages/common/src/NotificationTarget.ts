import { Schema } from 'effect'
import { Model } from 'effect/unstable/schema'
import { MattermostUserId, MattermostUsername } from './Mattermost'
import { MonitorId } from './Monitor'

export class NotificationTarget extends Model.Class<NotificationTarget>('NotificationTarget')({
  monitorId: MonitorId,
  mattermostUserId: MattermostUserId,
  mattermostUsername: MattermostUsername,
  mattermostDisplayName: Schema.String,
  createdAt: Model.DateTimeInsert,
}) {}

export const NotificationTargetDefinition = Schema.Struct({
  mattermostUserId: MattermostUserId,
})
export type NotificationTargetDefinition = typeof NotificationTargetDefinition.Type
