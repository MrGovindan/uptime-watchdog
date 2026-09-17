import {
  Monitor,
  MonitorHealth,
  MonitorId,
  MonitorWithHealth,
  WatchdogEvent,
} from '@uptime-watchdog/common'
import { Array, Option } from 'effect'
import { AsyncData, Update } from 'foldkit'
import { NotValidated } from 'foldkit/fieldValidation'
import { evo } from 'foldkit/struct'

import { ApiClient } from './apiClient'
import { DeleteMonitor, ListMonitors, RegisterMonitor, UpdateMonitor } from './command'
import {
  foldAddMonitorDialog,
  foldCloseAddMonitorDialog,
  foldCloseDeleteMonitorDialog,
  foldCronHelp,
  foldDeleteMonitorDialog,
  foldNotificationTargets,
  foldOpenAddMonitorDialog,
  foldOpenDeleteMonitorDialog,
  foldOpenNotificationTargets,
  foldShowToast,
  foldToast,
  openCronHelpDialog,
  resetForm,
} from './folds'
import { Message } from './message'
import { Form, formForMonitor, toMonitorDefinition, validateForm } from './monitorForm'
import { type Model, MonitorsAsyncData } from './model'

// MONITOR LIST

const monitorEntries = (model: Model): ReadonlyArray<MonitorWithHealth> =>
  Option.getOrElse(AsyncData.getData(model.monitors), () => [])

const withMonitorData = (model: Model, data: ReadonlyArray<MonitorWithHealth>): Model =>
  evo(model, { monitors: () => MonitorsAsyncData.Success({ data }) })

const upsertMonitor = (model: Model, monitor: Monitor): Model => {
  const existing = monitorEntries(model)
  const data = Array.some(existing, (entry) => entry.monitor.id === monitor.id)
    ? Array.map(existing, (entry) =>
        entry.monitor.id === monitor.id ? { monitor, health: entry.health } : entry,
      )
    : [{ monitor, health: Option.none() }, ...existing]

  return withMonitorData(model, data)
}

const replaceMonitor = (model: Model, monitor: Monitor): Model => {
  if (!AsyncData.hasData(model.monitors)) {
    return model
  }

  const data = Array.map(monitorEntries(model), (entry) =>
    entry.monitor.id === monitor.id ? { monitor, health: entry.health } : entry,
  )

  return withMonitorData(model, data)
}

const updateMonitorHealth = (
  model: Model,
  monitor: Monitor,
  health: Option.Option<MonitorHealth>,
): Model => {
  if (!AsyncData.hasData(model.monitors)) {
    return model
  }

  const data = Array.map(monitorEntries(model), (entry) =>
    entry.monitor.id === monitor.id ? { monitor, health } : entry,
  )

  return withMonitorData(model, data)
}

const removeMonitor = (model: Model, monitorId: MonitorId): Model => {
  if (!AsyncData.hasData(model.monitors)) {
    return model
  }

  const data = Array.filter(monitorEntries(model), (entry) => entry.monitor.id !== monitorId)

  return withMonitorData(model, data)
}

// Watchdog events patch the list in place. Registration seeds the list even
// while it is still loading; monitor events replace the monitor they carry
// while preserving its health, health events carry the latest observation.
const foldWatchdogEvent = (model: Model, event: WatchdogEvent): Model =>
  WatchdogEvent.match(event, {
    MonitorRegistered: ({ monitor }) => upsertMonitor(model, monitor),
    MonitorUpdated: ({ monitor }) => replaceMonitor(model, monitor),
    MonitorDeleted: ({ monitor }) => removeMonitor(model, monitor.id),
    MonitorHealthy: ({ monitor, health }) =>
      updateMonitorHealth(model, monitor, Option.some(health)),
    MonitorDegraded: ({ monitor, health }) =>
      updateMonitorHealth(model, monitor, Option.some(health)),
    NotificationTargetAdded: () => model,
    NotificationTargetRemoved: () => model,
  })

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message, ApiClient>>(message, {
    CompletedListMonitors: ({ monitors }) => ({
      model: evo(model, {
        monitors: () => MonitorsAsyncData.Success({ data: monitors }),
      }),
    }),

    FailedListMonitors: ({ error }) => ({
      model: evo(model, {
        monitors: () => MonitorsAsyncData.Failure({ error }),
      }),
    }),

    ClickedRetryListMonitors: () => ({
      model: evo(model, { monitors: () => MonitorsAsyncData.Loading() }),
      commands: [ListMonitors()],
    }),

    ClickedOpenAddMonitor: () => foldOpenAddMonitorDialog(resetForm(model)),

    ClickedOpenEditMonitor: ({ monitor }) =>
      foldOpenAddMonitorDialog(
        evo(resetForm(model), {
          form: () => formForMonitor(monitor),
          editingMonitorId: () => Option.some(monitor.id),
        }),
      ),

    GotAddMonitorDialogMessage: ({ message: dialogMessage }) =>
      foldAddMonitorDialog(model, dialogMessage),

    UpdatedName: ({ value }) => ({
      model: evo(model, {
        form: (form) => evo(form, { name: () => NotValidated({ value }) }),
      }),
    }),

    UpdatedHostname: ({ value }) => ({
      model: evo(model, {
        form: (form) => evo(form, { hostname: () => NotValidated({ value }) }),
      }),
    }),

    UpdatedPort: ({ value }) => ({
      model: evo(model, {
        form: (form) => evo(form, { port: () => NotValidated({ value }) }),
      }),
    }),

    UpdatedProtocol: ({ protocol }) => ({
      model: evo(model, {
        form: (form) => evo(form, { protocol: () => protocol }),
      }),
    }),

    UpdatedMethod: ({ method }) => ({
      model: evo(model, {
        form: (form) => evo(form, { method: () => method }),
      }),
    }),

    UpdatedPath: ({ value }) => ({
      model: evo(model, {
        form: (form) => evo(form, { path: () => value }),
      }),
    }),

    UpdatedExpectedStatus: ({ value }) => ({
      model: evo(model, {
        form: (form) => evo(form, { expectedStatus: () => NotValidated({ value }) }),
      }),
    }),

    UpdatedCronSchedule: ({ value }) => ({
      model: evo(model, {
        form: (form) => evo(form, { cronSchedule: () => NotValidated({ value }) }),
      }),
    }),

    ClickedAddHeader: () => ({
      model: evo(model, {
        form: (form: Form) =>
          evo(form, {
            headers: (headers) => [
              ...headers,
              {
                id: `header-${form.headerSequence}`,
                name: NotValidated({ value: '' }),
                value: NotValidated({ value: '' }),
              },
            ],
            headerSequence: (sequence) => sequence + 1,
          }),
      }),
    }),

    ClickedRemoveHeader: ({ id }) => ({
      model: evo(model, {
        form: (form) => evo(form, { headers: Array.filter((header) => header.id !== id) }),
      }),
    }),

    UpdatedHeaderName: ({ id, value }) => ({
      model: evo(model, {
        form: (form: Form) =>
          evo(form, {
            headers: Array.map((header) =>
              header.id === id ? { ...header, name: NotValidated({ value }) } : header,
            ),
          }),
      }),
    }),

    UpdatedHeaderValue: ({ id, value }) => ({
      model: evo(model, {
        form: (form: Form) =>
          evo(form, {
            headers: Array.map((header) =>
              header.id === id ? { ...header, value: NotValidated({ value }) } : header,
            ),
          }),
      }),
    }),

    ClickedCreateMonitor: () => {
      const validated = validateForm(model.form)
      if (!validated.isValid) {
        return { model: evo(model, { form: () => validated.form }) }
      }

      const definition = toMonitorDefinition(validated.form)
      const closed = foldCloseAddMonitorDialog(model)

      return {
        model: closed.model,
        commands: [RegisterMonitor({ definition }), ...(closed.commands ?? [])],
      }
    },

    ClickedUpdateMonitor: () => {
      if (Option.isNone(model.editingMonitorId)) {
        return { model }
      }

      const validated = validateForm(model.form)
      if (!validated.isValid) {
        return { model: evo(model, { form: () => validated.form }) }
      }

      const definition = toMonitorDefinition(validated.form)
      const closed = foldCloseAddMonitorDialog(model)

      return {
        model: closed.model,
        commands: [
          UpdateMonitor({ monitorId: model.editingMonitorId.value, definition }),
          ...(closed.commands ?? []),
        ],
      }
    },

    CompletedRegisterMonitor: ({ monitor }) =>
      foldShowToast(upsertMonitor(model, monitor), {
        variant: 'Success',
        payload: { message: 'Monitor created' },
      }),

    FailedRegisterMonitor: ({ error }) =>
      foldShowToast(model, { variant: 'Error', payload: { message: error } }),

    CompletedUpdateMonitor: ({ monitor }) =>
      foldShowToast(replaceMonitor(model, monitor), {
        variant: 'Success',
        payload: { message: 'Monitor updated' },
      }),

    FailedUpdateMonitor: ({ error }) =>
      foldShowToast(model, { variant: 'Error', payload: { message: error } }),

    ClickedRequestDeleteMonitor: ({ monitor }) =>
      foldOpenDeleteMonitorDialog(evo(model, { maybeDeleteMonitor: () => Option.some(monitor) })),

    ClickedCancelDeleteMonitor: () => foldCloseDeleteMonitorDialog(model),

    ClickedConfirmDeleteMonitor: () => {
      if (Option.isNone(model.maybeDeleteMonitor)) {
        return { model }
      }

      const closed = foldCloseDeleteMonitorDialog(model)

      return {
        model: closed.model,
        commands: [
          DeleteMonitor({ monitorId: model.maybeDeleteMonitor.value.id }),
          ...(closed.commands ?? []),
        ],
      }
    },

    GotDeleteMonitorDialogMessage: ({ message: dialogMessage }) =>
      foldDeleteMonitorDialog(model, dialogMessage),

    CompletedDeleteMonitor: ({ monitorId }) =>
      foldShowToast(removeMonitor(model, monitorId), {
        variant: 'Success',
        payload: { message: 'Monitor deleted' },
      }),

    FailedDeleteMonitor: ({ error }) =>
      foldShowToast(model, { variant: 'Error', payload: { message: error } }),

    ClickedOpenNotificationTargets: ({ monitorId, monitorName }) =>
      foldOpenNotificationTargets({ monitorId, monitorName })(model),

    GotNotificationTargetsMessage: ({ message: notificationTargetsMessage }) =>
      foldNotificationTargets(model, notificationTargetsMessage),

    ClickedOpenCronHelp: () => {
      const opened = openCronHelpDialog(model)
      return { model: opened.model, commands: opened.commands ?? [] }
    },

    GotCronHelpMessage: ({ message: cronHelpMessage }) => foldCronHelp(model, cronHelpMessage),

    GotToastMessage: ({ message: toastMessage }) => foldToast(model, toastMessage),

    GotWatchdogEvent: ({ event }) => ({ model: foldWatchdogEvent(model, event) }),
  })
