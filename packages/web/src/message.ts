import { HttpMethod, Monitor, Protocol } from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Toast } from './toast'

export const Message = defineMessageUnion({
  CompletedListMonitors: { monitors: Schema.Array(Monitor) },
  FailedListMonitors: { error: Schema.String },
  ClickedRetryListMonitors: {},

  ClickedOpenAddMonitor: {},
  GotAddMonitorDialogMessage: { message: Dialog.Message },

  UpdatedName: { value: Schema.String },
  UpdatedHostname: { value: Schema.String },
  UpdatedPort: { value: Schema.String },
  UpdatedProtocol: { protocol: Protocol },
  UpdatedMethod: { method: HttpMethod },
  UpdatedPath: { value: Schema.String },
  UpdatedCronSchedule: { value: Schema.String },
  ClickedAddHeader: {},
  ClickedRemoveHeader: { id: Schema.String },
  UpdatedHeaderName: { id: Schema.String, value: Schema.String },
  UpdatedHeaderValue: { id: Schema.String, value: Schema.String },
  ClickedCreateMonitor: {},

  CompletedRegisterMonitor: { monitor: Monitor },
  FailedRegisterMonitor: { error: Schema.String },

  GotToastMessage: { message: Toast.Message },
})

export type Message = typeof Message.Type
