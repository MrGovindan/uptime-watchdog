import { MattermostUser, NotificationTarget } from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const Message = defineMessageUnion({
  GotDialogMessage: { message: Dialog.Message },

  UpdatedSearchTerm: { value: Schema.String },
  CompletedSearchMattermostUsers: {
    term: Schema.String,
    version: Schema.Number,
    users: Schema.Array(MattermostUser),
  },
  FailedSearchMattermostUsers: {
    term: Schema.String,
    version: Schema.Number,
    error: Schema.String,
  },

  CompletedLoadNotificationTargets: { targets: Schema.Array(NotificationTarget) },
  FailedLoadNotificationTargets: { error: Schema.String },

  ClickedAddNotificationTarget: { mattermostUser: MattermostUser },
  CompletedAddNotificationTarget: { target: NotificationTarget },
  FailedAddNotificationTarget: { error: Schema.String },

  ClickedRemoveNotificationTarget: { mattermostUserId: Schema.String },
  CompletedRemoveNotificationTarget: { mattermostUserId: Schema.String },
  FailedRemoveNotificationTarget: { error: Schema.String },

  ClickedSendTest: { mattermostUserId: Schema.String },
  CompletedSendTestNotification: {},
  FailedSendTestNotification: { error: Schema.String },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  SentTestNotification: {},
  FailedTestNotification: { message: Schema.String },
})
export type OutMessage = typeof OutMessage.Type
