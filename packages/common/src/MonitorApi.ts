import { Schema } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/unstable/httpapi'
import {
  MattermostTestDefinition,
  MattermostUser,
  MattermostUserId,
  MattermostUserSearchDefinition,
} from './Mattermost'
import { Monitor, MonitorDefinition, MonitorId } from './Monitor'
import { NotificationTarget, NotificationTargetDefinition } from './NotificationTarget'
import { CronDescription, CronExpression } from './Uptime'

export class MonitorNotFound extends Schema.TaggedError<MonitorNotFound>()(
  'MonitorNotFound',
  { monitorId: MonitorId },
  { httpApiStatus: 404 },
) {
  override get message(): string {
    return `Monitor ${this.monitorId} was not found`
  }
}

export class NotificationTargetAlreadyExists extends Schema.TaggedError<NotificationTargetAlreadyExists>()(
  'NotificationTargetAlreadyExists',
  { monitorId: MonitorId, mattermostUserId: MattermostUserId },
  { httpApiStatus: 409 },
) {
  override get message(): string {
    return `Mattermost user ${this.mattermostUserId} is already a notification target for this monitor`
  }
}

export class MattermostUserNotFound extends Schema.TaggedError<MattermostUserNotFound>()(
  'MattermostUserNotFound',
  { mattermostUserId: MattermostUserId },
  { httpApiStatus: 404 },
) {
  override get message(): string {
    return `Mattermost user ${this.mattermostUserId} was not found`
  }
}

export class MattermostUnavailable extends Schema.TaggedError<MattermostUnavailable>()(
  'MattermostUnavailable',
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

export class ProviderUnavailable extends Schema.TaggedError<ProviderUnavailable>()(
  'ProviderUnavailable',
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

export class TokensExhausted extends Schema.TaggedError<TokensExhausted>()(
  'TokensExhausted',
  {},
  { httpApiStatus: 429 },
) {
  override get message(): string {
    return 'The schedule conversion provider has no tokens available'
  }
}

export class DescriptionNotConvertible extends Schema.TaggedError<DescriptionNotConvertible>()(
  'DescriptionNotConvertible',
  { description: CronDescription, message: Schema.String },
  { httpApiStatus: 422 },
) {
  override get message(): string {
    return `Schedule description "${this.description}" could not be converted to a cron expression`
  }
}

export const ScheduleConversion = Schema.Struct({
  cron: CronExpression,
})
export type ScheduleConversion = typeof ScheduleConversion.Type

export const Api = HttpApi.make('UptimeWatchdog')
  .add(
    HttpApiGroup.make('monitor').add(
      HttpApiEndpoint.post('register', '/monitor', {
        payload: Monitor.jsonCreate,
        success: Monitor.json.pipe(HttpApiSchema.status(201)),
      }),
      HttpApiEndpoint.get('list', '/monitor', {
        success: Schema.Array(Monitor.json),
      }),
      HttpApiEndpoint.put('updateMonitor', '/monitor/:monitorId', {
        params: { monitorId: MonitorId },
        payload: MonitorDefinition,
        success: Monitor.json,
        error: MonitorNotFound,
      }),
      HttpApiEndpoint.delete('deleteMonitor', '/monitor/:monitorId', {
        params: { monitorId: MonitorId },
        success: HttpApiSchema.NoContent,
        error: MonitorNotFound,
      }),
      HttpApiEndpoint.get('listNotificationTargets', '/monitor/:monitorId/notification-target', {
        params: { monitorId: MonitorId },
        success: Schema.Array(NotificationTarget.json),
        error: MonitorNotFound,
      }),
      HttpApiEndpoint.post('addNotificationTarget', '/monitor/:monitorId/notification-target', {
        params: { monitorId: MonitorId },
        payload: NotificationTargetDefinition,
        success: NotificationTarget.json.pipe(HttpApiSchema.status(201)),
        error: [
          MonitorNotFound,
          NotificationTargetAlreadyExists,
          MattermostUserNotFound,
          MattermostUnavailable,
        ],
      }),
      HttpApiEndpoint.delete(
        'removeNotificationTarget',
        '/monitor/:monitorId/notification-target/:mattermostUserId',
        {
          params: { monitorId: MonitorId, mattermostUserId: MattermostUserId },
          success: HttpApiSchema.NoContent,
          error: MonitorNotFound,
        },
      ),
    ),
  )
  .add(
    HttpApiGroup.make('schedule').add(
      HttpApiEndpoint.post('convertDescription', '/cron', {
        payload: Schema.Struct({ description: CronDescription }),
        success: ScheduleConversion,
        error: [ProviderUnavailable, TokensExhausted, DescriptionNotConvertible],
      }),
    ),
  )
  .add(
    HttpApiGroup.make('notification').add(
      HttpApiEndpoint.post('searchMattermostUsers', '/notification/mattermost/user/search', {
        payload: MattermostUserSearchDefinition,
        success: Schema.Array(MattermostUser),
        error: MattermostUnavailable,
      }),
      HttpApiEndpoint.post('sendMattermostTest', '/notification/mattermost/test', {
        payload: MattermostTestDefinition,
        success: HttpApiSchema.NoContent,
        error: [MonitorNotFound, MattermostUserNotFound, MattermostUnavailable],
      }),
    ),
  )
