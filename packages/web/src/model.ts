import { Monitor, MonitorId } from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { AsyncData } from 'foldkit'

import * as NotificationTargets from './notificationTargets'
import { Form, makeInitialForm } from './monitorForm'
import { Toast } from './toast'

export const MonitorsAsyncData = AsyncData.Schema(Schema.Array(Monitor), Schema.String)

export const Model = Schema.Struct({
  monitors: MonitorsAsyncData.schema,
  form: Form,
  editingMonitorId: Schema.Option(MonitorId),
  dialog: Dialog.Model,
  deleteDialog: Dialog.Model,
  maybeDeleteMonitor: Schema.Option(Monitor),
  notificationTargets: NotificationTargets.Model,
  toast: Toast.Model,
})
export type Model = typeof Model.Type

export const makeInitialModel = (): Model => ({
  monitors: MonitorsAsyncData.Loading(),
  form: makeInitialForm(),
  editingMonitorId: Option.none(),
  dialog: Dialog.init({ id: 'add-monitor-dialog' }),
  deleteDialog: Dialog.init({ id: 'delete-monitor-dialog' }),
  maybeDeleteMonitor: Option.none(),
  notificationTargets: NotificationTargets.init().model,
  toast: Toast.init({ id: 'app-toast' }),
})
