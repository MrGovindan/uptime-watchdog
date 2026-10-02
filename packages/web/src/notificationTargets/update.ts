import { type NotificationTarget } from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { Array, Number, Option } from 'effect'
import { AsyncData, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { ApiClient } from '../apiClient'
import {
  AddNotificationTarget,
  LoadNotificationTargets,
  RemoveNotificationTarget,
  SearchMattermostUsers,
  SendTestNotification,
} from './command'
import { Message, OutMessage } from './message'
import { Model, type OpenInput, SearchState, TargetsAsyncData } from './model'

export type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClient>
export type InitReturn = Update.Return<Model, Message>

const MIN_SEARCH_LENGTH = 2

export const init = (): InitReturn => ({
  model: {
    dialog: Dialog.init({ id: 'notification-targets-dialog' }),
    maybeMonitorId: Option.none(),
    maybeMonitorName: Option.none(),
    targets: TargetsAsyncData.Idle(),
    searchTerm: '',
    searchVersion: 0,
    searchState: SearchState.Idle(),
    maybeError: Option.none(),
  },
})

const resetSession = (model: Model): Model =>
  modifyFields(model, {
    maybeMonitorId: () => Option.none(),
    maybeMonitorName: () => Option.none(),
    targets: () => TargetsAsyncData.Idle(),
    searchTerm: () => '',
    searchVersion: () => 0,
    searchState: () => SearchState.Idle(),
    maybeError: () => Option.none(),
  })

const readDialog = (model: Model) => Option.some(model.dialog)
const writeDialog = (model: Model, nextDialog: Dialog.Model): Model => modifyFields(model, { dialog: () => nextDialog })
const toDialogMessage = (message: Dialog.Message): Message => Message.GotDialogMessage({ message })

const foldDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model: resetSession(model) }),
})

const foldDialog = Update.foldChild({
  update: Dialog.update,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toDialogMessage,
  foldOutMessage: foldDialogOutMessage,
})

const foldDialogOpen = Update.foldChildStep({
  update: Dialog.open,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toDialogMessage,
  foldOutMessage: foldDialogOutMessage,
})

const appendTarget = (targets: Model['targets'], target: NotificationTarget): Model['targets'] => {
  const existing = AsyncData.hasData(targets) ? Option.getOrElse(AsyncData.getData(targets), () => []) : []

  return TargetsAsyncData.Success({ data: [...existing, target] })
}

const removeTarget = (targets: Model['targets'], mattermostUserId: string): Model['targets'] => {
  if (!AsyncData.hasData(targets)) {
    return targets
  }

  const existing = Option.getOrElse(AsyncData.getData(targets), () => [])

  return TargetsAsyncData.Success({
    data: Array.filter(existing, (target) => target.mattermostUserId !== mattermostUserId),
  })
}

export const open = (model: Model, input: OpenInput): UpdateReturn =>
  Update.combine(model, [
    foldDialogOpen,
    (stepModel) => ({
      model: modifyFields(stepModel, {
        maybeMonitorId: () => Option.some(input.monitorId),
        maybeMonitorName: () => Option.some(input.monitorName),
        targets: () => TargetsAsyncData.Loading(),
        searchTerm: () => '',
        searchVersion: () => 0,
        searchState: () => SearchState.Idle(),
        maybeError: () => Option.none(),
      }),
      commands: [LoadNotificationTargets({ monitorId: input.monitorId })],
    }),
  ])

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    GotDialogMessage: ({ message: dialogMessage }) => foldDialog(model, dialogMessage),

    UpdatedSearchTerm: ({ value }) => {
      const term = value.trim()

      if (term.length < MIN_SEARCH_LENGTH) {
        return {
          model: modifyFields(model, {
            searchTerm: () => value,
            searchState: () => SearchState.Idle(),
          }),
        }
      }

      const nextVersion = Number.increment(model.searchVersion)

      return {
        model: modifyFields(model, {
          searchTerm: () => value,
          searchVersion: () => nextVersion,
          searchState: () => SearchState.Loading(),
        }),
        commands: [SearchMattermostUsers({ term, version: nextVersion })],
      }
    },

    CompletedSearchMattermostUsers: ({ term, version, users }) => {
      if (version !== model.searchVersion || term !== model.searchTerm.trim()) {
        return { model }
      }

      return { model: modifyFields(model, { searchState: () => SearchState.Ok({ users }) }) }
    },

    FailedSearchMattermostUsers: ({ term, version, error }) => {
      if (version !== model.searchVersion || term !== model.searchTerm.trim()) {
        return { model }
      }

      return { model: modifyFields(model, { searchState: () => SearchState.Failed({ error }) }) }
    },

    CompletedLoadNotificationTargets: ({ targets }) => ({
      model: modifyFields(model, {
        targets: () => TargetsAsyncData.Success({ data: targets }),
        maybeError: () => Option.none(),
      }),
    }),

    FailedLoadNotificationTargets: ({ error }) => ({
      model: modifyFields(model, {
        targets: () => TargetsAsyncData.Failure({ error }),
        maybeError: () => Option.none(),
      }),
    }),

    ClickedAddNotificationTarget: ({ mattermostUser }) => {
      if (Option.isNone(model.maybeMonitorId)) {
        return { model }
      }

      return {
        model: modifyFields(model, { maybeError: () => Option.none() }),
        commands: [
          AddNotificationTarget({
            monitorId: model.maybeMonitorId.value,
            mattermostUserId: mattermostUser.id,
          }),
        ],
      }
    },

    CompletedAddNotificationTarget: ({ target }) => ({
      model: modifyFields(model, {
        targets: () => appendTarget(model.targets, target),
        searchState: () => SearchState.Idle(),
        searchTerm: () => '',
        maybeError: () => Option.none(),
      }),
    }),

    FailedAddNotificationTarget: ({ error }) => ({
      model: modifyFields(model, { maybeError: () => Option.some(error) }),
    }),

    ClickedRemoveNotificationTarget: ({ mattermostUserId }) => {
      if (Option.isNone(model.maybeMonitorId)) {
        return { model }
      }

      return {
        model: modifyFields(model, { maybeError: () => Option.none() }),
        commands: [
          RemoveNotificationTarget({
            monitorId: model.maybeMonitorId.value,
            mattermostUserId,
          }),
        ],
      }
    },

    CompletedRemoveNotificationTarget: ({ mattermostUserId }) => ({
      model: modifyFields(model, { targets: () => removeTarget(model.targets, mattermostUserId) }),
    }),

    FailedRemoveNotificationTarget: ({ error }) => ({
      model: modifyFields(model, { maybeError: () => Option.some(error) }),
    }),

    ClickedSendTest: ({ mattermostUserId }) => ({
      model: modifyFields(model, { maybeError: () => Option.none() }),
      commands: [
        SendTestNotification({
          monitorId: Option.getOrUndefined(model.maybeMonitorId),
          mattermostUserId,
        }),
      ],
    }),

    CompletedSendTestNotification: () => ({
      model,
      outMessage: OutMessage.SentTestNotification(),
    }),

    FailedSendTestNotification: ({ error }) => ({
      model,
      outMessage: OutMessage.FailedTestNotification({ message: error }),
    }),
  })
