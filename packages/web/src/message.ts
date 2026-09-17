import {
  HttpMethod,
  Monitor,
  MonitorId,
  MonitorName,
  Protocol,
  WatchdogEvent,
} from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import * as CronHelp from './cronHelp'
import * as NotificationTargets from './notificationTargets'
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
  UpdatedExpectedStatus: { value: Schema.String },
  UpdatedCronSchedule: { value: Schema.String },
  ClickedAddHeader: {},
  ClickedRemoveHeader: { id: Schema.String },
  UpdatedHeaderName: { id: Schema.String, value: Schema.String },
  UpdatedHeaderValue: { id: Schema.String, value: Schema.String },
  ClickedCreateMonitor: {},

  CompletedRegisterMonitor: { monitor: Monitor },
  FailedRegisterMonitor: { error: Schema.String },

  ClickedOpenEditMonitor: { monitor: Monitor },
  ClickedUpdateMonitor: {},
  CompletedUpdateMonitor: { monitor: Monitor },
  FailedUpdateMonitor: { error: Schema.String },

  ClickedRequestDeleteMonitor: { monitor: Monitor },
  ClickedCancelDeleteMonitor: {},
  ClickedConfirmDeleteMonitor: {},
  GotDeleteMonitorDialogMessage: { message: Dialog.Message },
  CompletedDeleteMonitor: { monitorId: MonitorId },
  FailedDeleteMonitor: { error: Schema.String },

  ClickedOpenNotificationTargets: { monitorId: MonitorId, monitorName: MonitorName },
  GotNotificationTargetsMessage: { message: NotificationTargets.Message },

  ClickedOpenCronHelp: {},
  GotCronHelpMessage: { message: CronHelp.Message },

  GotToastMessage: { message: Toast.Message },

  GotWatchdogEvent: { event: WatchdogEvent },
})

export type Message = typeof Message.Type
