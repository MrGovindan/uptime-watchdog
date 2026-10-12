import { MattermostUser, MonitorId, MonitorName, NotificationTarget, Weekday } from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

export const TargetsAsyncData = AsyncData.Schema(Schema.Array(NotificationTarget), Schema.String)

const Users = Schema.Array(MattermostUser)

export const SearchState = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Ok: { users: Users },
  Failed: { error: Schema.String },
})
export type SearchState = typeof SearchState.Type

export const WindowEditor = Schema.Struct({
  mattermostUserId: Schema.String,
  days: Schema.Array(Weekday),
  startTime: Schema.String,
  endTime: Schema.String,
  timezone: Schema.String,
})
export type WindowEditor = typeof WindowEditor.Type

export const detectTimezone = (): string => {
  try {
    const { timeZone } = Intl.DateTimeFormat().resolvedOptions()
    return typeof timeZone === 'string' && timeZone !== '' ? timeZone : 'UTC'
  } catch {
    return 'UTC'
  }
}

export const Model = Schema.Struct({
  dialog: Dialog.Model,
  maybeMonitorId: Schema.Option(MonitorId),
  maybeMonitorName: Schema.Option(MonitorName),
  targets: TargetsAsyncData.schema,
  searchTerm: Schema.String,
  searchVersion: Schema.Number,
  searchState: SearchState,
  windowEditor: Schema.Option(WindowEditor),
  maybeError: Schema.Option(Schema.String),
  currentTimezone: Schema.String,
})
export type Model = typeof Model.Type

export type OpenInput = Readonly<{ monitorId: MonitorId; monitorName: MonitorName }>
