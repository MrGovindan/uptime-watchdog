import {
  type NotificationTarget,
  NotificationWindowDefinition,
  WEEKDAY_NAMES,
  type Weekday,
} from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { Array, Number, Option, Schema } from 'effect'
import { AsyncData, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { ApiClient } from '../apiClient'
import {
  AddNotificationTarget,
  LoadNotificationTargets,
  RemoveNotificationTarget,
  SearchMattermostUsers,
  UpdateNotificationTargetWindow,
} from './command'
import { Message } from './message'
import { Model, type OpenInput, SearchState, TargetsAsyncData, type WindowEditor } from './model'

export type UpdateReturn = Update.Return<Model, Message, ApiClient>
export type InitReturn = Update.Return<Model, Message>

const MIN_SEARCH_LENGTH = 2

const DEFAULT_WINDOW_START_TIME = '09:00'
const DEFAULT_WINDOW_END_TIME = '17:00'
const WINDOW_INVALID_ERROR = 'Select at least one day and choose different start and end times.'

export const init = (): InitReturn => ({
  model: {
    dialog: Dialog.init({ id: 'notification-targets-dialog' }),
    maybeMonitorId: Option.none(),
    maybeMonitorName: Option.none(),
    targets: TargetsAsyncData.Idle(),
    searchTerm: '',
    searchVersion: 0,
    searchState: SearchState.Idle(),
    windowEditor: Option.none(),
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
    windowEditor: () => Option.none(),
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

const replaceTarget = (targets: Model['targets'], updated: NotificationTarget): Model['targets'] => {
  if (!AsyncData.hasData(targets)) {
    return targets
  }

  const existing = Option.getOrElse(AsyncData.getData(targets), () => [])

  return TargetsAsyncData.Success({
    data: Array.map(existing, (target) => (target.mattermostUserId === updated.mattermostUserId ? updated : target)),
  })
}

const seedWindowEditor = (target: NotificationTarget): WindowEditor => {
  if (target.window === null) {
    return {
      mattermostUserId: target.mattermostUserId,
      days: WEEKDAY_NAMES,
      startTime: DEFAULT_WINDOW_START_TIME,
      endTime: DEFAULT_WINDOW_END_TIME,
      timezone: '',
    }
  }

  return {
    mattermostUserId: target.mattermostUserId,
    days: target.window.days,
    startTime: target.window.startTime,
    endTime: target.window.endTime,
    timezone: target.window.timezone,
  }
}

const toWindowDefinition = (editor: WindowEditor): Option.Option<NotificationWindowDefinition> =>
  Schema.decodeUnknownOption(NotificationWindowDefinition)({
    ...(editor.timezone.trim() === '' ? {} : { timezone: editor.timezone.trim() }),
    days: editor.days,
    startTime: editor.startTime,
    endTime: editor.endTime,
  })

const setWindowEditor = (model: Model, editor: WindowEditor): Model =>
  modifyFields(model, { windowEditor: () => Option.some(editor) })

const toggleDay = (days: ReadonlyArray<Weekday>, day: Weekday): ReadonlyArray<Weekday> =>
  Array.contains(days, day) ? Array.filter(days, (candidate) => candidate !== day) : Array.append(days, day)

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
        windowEditor: () => Option.none(),
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

    ClickedEditNotificationWindow: ({ target }) => ({
      model: modifyFields(model, {
        windowEditor: () => Option.some(seedWindowEditor(target)),
        maybeError: () => Option.none(),
      }),
    }),

    ClosedNotificationWindowEditor: () => ({
      model: modifyFields(model, {
        windowEditor: () => Option.none(),
        maybeError: () => Option.none(),
      }),
    }),

    ToggledNotificationWindowDay: ({ day }) => {
      if (Option.isNone(model.windowEditor)) {
        return { model }
      }

      const editor = model.windowEditor.value

      return {
        model: setWindowEditor(model, {
          ...editor,
          days: toggleDay(editor.days, day),
        }),
      }
    },

    UpdatedNotificationWindowStartTime: ({ value }) => {
      if (Option.isNone(model.windowEditor)) {
        return { model }
      }

      return { model: setWindowEditor(model, { ...model.windowEditor.value, startTime: value }) }
    },

    UpdatedNotificationWindowEndTime: ({ value }) => {
      if (Option.isNone(model.windowEditor)) {
        return { model }
      }

      return { model: setWindowEditor(model, { ...model.windowEditor.value, endTime: value }) }
    },

    UpdatedNotificationWindowTimezone: ({ value }) => {
      if (Option.isNone(model.windowEditor)) {
        return { model }
      }

      return { model: setWindowEditor(model, { ...model.windowEditor.value, timezone: value }) }
    },

    ClickedSaveNotificationWindow: () => {
      if (Option.isNone(model.windowEditor) || Option.isNone(model.maybeMonitorId)) {
        return { model }
      }

      const editor = model.windowEditor.value
      const maybeWindow = toWindowDefinition(editor)

      if (Option.isNone(maybeWindow)) {
        return { model: modifyFields(model, { maybeError: () => Option.some(WINDOW_INVALID_ERROR) }) }
      }

      return {
        model: modifyFields(model, { maybeError: () => Option.none() }),
        commands: [
          UpdateNotificationTargetWindow({
            monitorId: model.maybeMonitorId.value,
            mattermostUserId: editor.mattermostUserId,
            window: maybeWindow.value,
          }),
        ],
      }
    },

    ClickedClearNotificationWindow: () => {
      if (Option.isNone(model.windowEditor) || Option.isNone(model.maybeMonitorId)) {
        return { model }
      }

      const editor = model.windowEditor.value

      return {
        model: modifyFields(model, { maybeError: () => Option.none() }),
        commands: [
          UpdateNotificationTargetWindow({
            monitorId: model.maybeMonitorId.value,
            mattermostUserId: editor.mattermostUserId,
            window: null,
          }),
        ],
      }
    },

    CompletedUpdateNotificationTargetWindow: ({ target }) => ({
      model: modifyFields(model, {
        targets: () => replaceTarget(model.targets, target),
        windowEditor: () => Option.none(),
        maybeError: () => Option.none(),
      }),
    }),

    FailedUpdateNotificationTargetWindow: ({ error }) => ({
      model: modifyFields(model, { maybeError: () => Option.some(error) }),
    }),
  })
