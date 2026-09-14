import { Dialog } from '@foldkit/ui'
import { Option } from 'effect'
import { Update } from 'foldkit'
import { evo } from 'foldkit/struct'

import { Message } from './message'
import * as NotificationTargets from './notificationTargets'
import { makeInitialForm } from './monitorForm'
import type { Model } from './model'
import { Toast } from './toast'

type ToastModel = typeof Toast.Model.Type
type ToastMessage = typeof Toast.Message.Type

// ADD MONITOR DIALOG

const readDialog = (model: Model) => Option.some(model.dialog)
const writeDialog = (model: Model, nextDialog: Dialog.Model): Model =>
  evo(model, { dialog: () => nextDialog })
const toAddMonitorDialogMessage = (message: Dialog.Message): Message =>
  Message.GotAddMonitorDialogMessage({ message })

export const resetForm = (model: Model): Model =>
  evo(model, { form: () => makeInitialForm(), editingMonitorId: () => Option.none() })

const foldAddMonitorDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model: resetForm(model) }),
})

export const foldAddMonitorDialog = Update.foldChild({
  update: Dialog.update,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toAddMonitorDialogMessage,
  foldOutMessage: foldAddMonitorDialogOutMessage,
})

export const foldOpenAddMonitorDialog = Update.foldChildStep({
  update: Dialog.open,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toAddMonitorDialogMessage,
  foldOutMessage: foldAddMonitorDialogOutMessage,
})

export const foldCloseAddMonitorDialog = Update.foldChildStep({
  update: Dialog.close,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toAddMonitorDialogMessage,
  foldOutMessage: foldAddMonitorDialogOutMessage,
})

// DELETE MONITOR DIALOG

const readDeleteDialog = (model: Model) => Option.some(model.deleteDialog)
const writeDeleteDialog = (model: Model, nextDialog: Dialog.Model): Model =>
  evo(model, { deleteDialog: () => nextDialog })
const toDeleteMonitorDialogMessage = (message: Dialog.Message): Message =>
  Message.GotDeleteMonitorDialogMessage({ message })

const foldDeleteMonitorDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model: evo(model, { maybeDeleteMonitor: () => Option.none() }) }),
})

export const foldDeleteMonitorDialog = Update.foldChild({
  update: Dialog.update,
  read: readDeleteDialog,
  write: writeDeleteDialog,
  toParentMessage: toDeleteMonitorDialogMessage,
  foldOutMessage: foldDeleteMonitorDialogOutMessage,
})

export const foldOpenDeleteMonitorDialog = Update.foldChildStep({
  update: Dialog.open,
  read: readDeleteDialog,
  write: writeDeleteDialog,
  toParentMessage: toDeleteMonitorDialogMessage,
  foldOutMessage: foldDeleteMonitorDialogOutMessage,
})

export const foldCloseDeleteMonitorDialog = Update.foldChildStep({
  update: Dialog.close,
  read: readDeleteDialog,
  write: writeDeleteDialog,
  toParentMessage: toDeleteMonitorDialogMessage,
  foldOutMessage: foldDeleteMonitorDialogOutMessage,
})

// TOAST

const readToast = (model: Model) => Option.some(model.toast)
const writeToast = (model: Model, nextToast: ToastModel): Model =>
  evo(model, { toast: () => nextToast })
const toToastMessage = (message: ToastMessage): Message => Message.GotToastMessage({ message })

const foldToastOutMessage = Toast.OutMessage.match<Update.Step<Model, Message>>({
  DismissedToast: () => (model) => ({ model }),
})

export const foldToast = Update.foldChild({
  update: Toast.update,
  read: readToast,
  write: writeToast,
  toParentMessage: toToastMessage,
  foldOutMessage: foldToastOutMessage,
})

export const foldShowToast = Update.foldChild({
  update: Toast.show,
  read: readToast,
  write: writeToast,
  toParentMessage: toToastMessage,
  foldOutMessage: foldToastOutMessage,
})

// NOTIFICATION TARGETS

const readNotificationTargets = (model: Model) => Option.some(model.notificationTargets)
const writeNotificationTargets = (
  model: Model,
  nextNotificationTargets: NotificationTargets.Model,
): Model => evo(model, { notificationTargets: () => nextNotificationTargets })
const toNotificationTargetsMessage = (message: NotificationTargets.Message): Message =>
  Message.GotNotificationTargetsMessage({ message })

const foldNotificationTargetsOutMessage = NotificationTargets.OutMessage.match<
  Update.Step<Model, Message>
>({
  SentTestNotification: () => (stepModel) =>
    foldShowToast(stepModel, {
      variant: 'Success',
      payload: { message: 'Test notification sent' },
    }),
  FailedTestNotification:
    ({ message }) =>
    (stepModel) =>
      foldShowToast(stepModel, { variant: 'Error', payload: { message } }),
})

export const foldNotificationTargets = Update.foldChild({
  update: NotificationTargets.update,
  read: readNotificationTargets,
  write: writeNotificationTargets,
  toParentMessage: toNotificationTargetsMessage,
  foldOutMessage: foldNotificationTargetsOutMessage,
})

export const foldOpenNotificationTargets = Update.foldChild({
  update: (
    notificationTargetsModel: NotificationTargets.Model,
    input: NotificationTargets.OpenInput,
  ) => NotificationTargets.open(notificationTargetsModel, input),
  read: readNotificationTargets,
  write: writeNotificationTargets,
  toParentMessage: toNotificationTargetsMessage,
  foldOutMessage: foldNotificationTargetsOutMessage,
})
