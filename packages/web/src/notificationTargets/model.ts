import { MattermostUser, MonitorId, MonitorName, NotificationTarget } from '@uptime-watchdog/common'
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

export const Model = Schema.Struct({
  dialog: Dialog.Model,
  maybeMonitorId: Schema.Option(MonitorId),
  maybeMonitorName: Schema.Option(MonitorName),
  targets: TargetsAsyncData.schema,
  searchTerm: Schema.String,
  searchVersion: Schema.Number,
  searchState: SearchState,
  maybeError: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export type OpenInput = Readonly<{ monitorId: MonitorId; monitorName: MonitorName }>
