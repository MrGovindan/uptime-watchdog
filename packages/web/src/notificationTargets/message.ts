import { MattermostUser, NotificationTarget, Weekday } from '@uptime-watchdog/common'
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

  ClickedEditNotificationWindow: { target: NotificationTarget },
  ClosedNotificationWindowEditor: {},
  ToggledNotificationWindowDay: { day: Weekday },
  UpdatedNotificationWindowStartTime: { value: Schema.String },
  UpdatedNotificationWindowEndTime: { value: Schema.String },
  UpdatedNotificationWindowTimezone: { value: Schema.String },
  ClickedSaveNotificationWindow: {},
  ClickedClearNotificationWindow: {},
  CompletedUpdateNotificationTargetWindow: { target: NotificationTarget },
  FailedUpdateNotificationTargetWindow: { error: Schema.String },
})
export type Message = typeof Message.Type
