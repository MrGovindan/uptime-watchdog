import {
  CronExpression,
  HttpMethod,
  Monitor,
  type MonitorDefinition,
  Protocol,
} from '@uptime-watchdog/common'
import { Button, Dialog, Input, Select } from '@foldkit/ui'
import { Array, Cron, Option, Predicate, Schema } from 'effect'
import { AsyncData, FieldValidation, Runtime, Update } from 'foldkit'
import {
  Field,
  Invalid,
  NotValidated,
  Rule,
  allValid,
  makeRules,
  validate,
} from 'foldkit/fieldValidation'
import type { Attribute, ChildAttribute, Document, Html, HtmlBuilder } from 'foldkit/html'
import { evo } from 'foldkit/struct'

import { ApiClient } from './apiClient'
import { ListMonitors, RegisterMonitor } from './command'
import { Message } from './message'
import { Toast } from './toast'

const APP_NAME = 'Uptime Watchdog'

type ToastModel = typeof Toast.Model.Type
type ToastMessage = typeof Toast.Message.Type

const toProtocol = (value: string): Protocol => (value === 'http' ? 'http' : 'https')

// FIELD VALIDATION

const isBlank = (value: string): boolean => value.trim() === ''

const hostnameRules = makeRules({
  required: 'Hostname is required',
  isEmpty: isBlank,
})

const PortValue = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isGreaterThan(0)),
  Schema.check(Schema.isLessThanOrEqualTo(65535)),
)

const portRules = makeRules({
  required: 'Port is required',
  rules: [Rule.fromSchema(PortValue, 'Port must be a whole number from 1 to 65535')],
})

const cronScheduleRules = makeRules({
  required: 'Cron schedule is required',
  rules: [Rule.fromSchema(CronExpression, 'Enter a valid cron expression')],
})

const headerNameRules = makeRules({
  required: 'Header name is required',
  isEmpty: isBlank,
})

const headerValueRules = makeRules({
  required: 'Header value is required',
  isEmpty: isBlank,
})

// MODEL

const HeaderRow = Schema.Struct({
  id: Schema.String,
  name: Field(Schema.String),
  value: Field(Schema.String),
})
export type HeaderRow = typeof HeaderRow.Type

const Form = Schema.Struct({
  hostname: Field(Schema.String),
  port: Field(Schema.String),
  protocol: Protocol,
  method: HttpMethod,
  path: Schema.String,
  cronSchedule: Field(Schema.String),
  headers: Schema.Array(HeaderRow),
  headerSequence: Schema.Number,
})
export type Form = typeof Form.Type

export const MonitorsAsyncData = AsyncData.Schema(Schema.Array(Monitor), Schema.String)

export const Model = Schema.Struct({
  monitors: MonitorsAsyncData.schema,
  form: Form,
  dialog: Dialog.Model,
  toast: Toast.Model,
})
export type Model = typeof Model.Type

const emptyField = () => NotValidated({ value: '' })

export const makeInitialForm = (): Form => ({
  hostname: emptyField(),
  port: emptyField(),
  protocol: 'https',
  method: 'GET',
  path: '',
  cronSchedule: emptyField(),
  headers: [],
  headerSequence: 0,
})

export const makeInitialModel = (): Model => ({
  monitors: MonitorsAsyncData.Loading(),
  form: makeInitialForm(),
  dialog: Dialog.init({ id: 'add-monitor-dialog' }),
  toast: Toast.init({ id: 'app-toast' }),
})

// INIT

export const init: Runtime.ApplicationInit<Model, Message, void, ApiClient> = () => ({
  model: makeInitialModel(),
  commands: [ListMonitors()],
})

// VALIDATION

const validateHeaderRows = (
  headers: ReadonlyArray<HeaderRow>,
): Readonly<{ headers: ReadonlyArray<HeaderRow>; isValid: boolean }> => {
  const nonEmptyHeaders = Array.filter(
    headers,
    (header) => !(isBlank(header.name.value) && isBlank(header.value.value)),
  )

  const seenNames = new Set<string>()
  const validatedHeaders = Array.map(nonEmptyHeaders, (header) => {
    const key = header.name.value.trim().toLowerCase()
    const isDuplicate = seenNames.has(key)
    seenNames.add(key)

    if (isDuplicate) {
      return {
        ...header,
        name: Invalid({
          value: header.name.value,
          errors: ['Duplicate header name'],
        }),
        value: validate(headerValueRules)(header.value.value),
      }
    }

    return {
      ...header,
      name: validate(headerNameRules)(header.name.value),
      value: validate(headerValueRules)(header.value.value),
    }
  })

  const isValid = Array.every(
    validatedHeaders,
    (header) => header.name._tag === 'Valid' && header.value._tag === 'Valid',
  )

  return { headers: validatedHeaders, isValid }
}

const validateForm = (form: Form): Readonly<{ form: Form; isValid: boolean }> => {
  const hostname = validate(hostnameRules)(form.hostname.value)
  const port = validate(portRules)(form.port.value)
  const cronSchedule = validate(cronScheduleRules)(form.cronSchedule.value)
  const headers = validateHeaderRows(form.headers)

  const isValid =
    allValid([
      [hostname, hostnameRules],
      [port, portRules],
      [cronSchedule, cronScheduleRules],
    ]) && headers.isValid

  return {
    form: { ...form, hostname, port, cronSchedule, headers: headers.headers },
    isValid,
  }
}

const toMonitorDefinition = (form: Form): MonitorDefinition => {
  const headers = Object.fromEntries(
    Array.map(form.headers, (header) => [header.name.value.trim(), header.value.value.trim()]),
  )
  const trimmedPath = form.path.trim()

  return {
    cronSchedule: Schema.decodeSync(CronExpression)(form.cronSchedule.value.trim()),
    request: {
      hostname: form.hostname.value.trim(),
      port: Number(form.port.value),
      protocol: form.protocol,
      method: form.method,
      headers,
      ...(trimmedPath === '' ? {} : { path: trimmedPath }),
    },
  }
}

// UPDATE

const readDialog = (model: Model) => Option.some(model.dialog)
const writeDialog = (model: Model, nextDialog: Dialog.Model): Model =>
  evo(model, { dialog: () => nextDialog })
const toAddMonitorDialogMessage = (message: Dialog.Message): Message =>
  Message.GotAddMonitorDialogMessage({ message })

const resetForm = (model: Model): Model => evo(model, { form: () => makeInitialForm() })

const foldAddMonitorDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model: resetForm(model) }),
})

const foldAddMonitorDialog = Update.foldChild({
  update: Dialog.update,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toAddMonitorDialogMessage,
  foldOutMessage: foldAddMonitorDialogOutMessage,
})

const foldOpenAddMonitorDialog = Update.foldChildStep({
  update: Dialog.open,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toAddMonitorDialogMessage,
  foldOutMessage: foldAddMonitorDialogOutMessage,
})

const foldCloseAddMonitorDialog = Update.foldChildStep({
  update: Dialog.close,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toAddMonitorDialogMessage,
  foldOutMessage: foldAddMonitorDialogOutMessage,
})

const readToast = (model: Model) => Option.some(model.toast)
const writeToast = (model: Model, nextToast: ToastModel): Model =>
  evo(model, { toast: () => nextToast })
const toToastMessage = (message: ToastMessage): Message => Message.GotToastMessage({ message })

const foldToastOutMessage = Toast.OutMessage.match<Update.Step<Model, Message>>({
  DismissedToast: () => (model) => ({ model }),
})

const foldToast = Update.foldChild({
  update: Toast.update,
  read: readToast,
  write: writeToast,
  toParentMessage: toToastMessage,
  foldOutMessage: foldToastOutMessage,
})

const foldShowToast = Update.foldChild({
  update: Toast.show,
  read: readToast,
  write: writeToast,
  toParentMessage: toToastMessage,
  foldOutMessage: foldToastOutMessage,
})

const insertMonitor = (model: Model, monitor: Monitor): Model => {
  if (AsyncData.hasData(model.monitors)) {
    const existing = Option.getOrElse(AsyncData.getData(model.monitors), () => [])
    const data = [monitor, ...existing]
    return evo(model, { monitors: () => MonitorsAsyncData.Success({ data }) })
  }

  return evo(model, {
    monitors: () => MonitorsAsyncData.Success({ data: [monitor] }),
  })
}

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

    GotAddMonitorDialogMessage: ({ message: dialogMessage }) =>
      foldAddMonitorDialog(model, dialogMessage),

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

    UpdatedCronSchedule: ({ value }) => ({
      model: evo(model, {
        form: (form) => evo(form, { cronSchedule: () => NotValidated({ value }) }),
      }),
    }),

    ClickedAddHeader: () => ({
      model: evo(model, {
        form: (form) =>
          evo(form, {
            headers: (headers) => [
              ...headers,
              {
                id: `header-${form.headerSequence}`,
                name: emptyField(),
                value: emptyField(),
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
        form: (form) =>
          evo(form, {
            headers: Array.map((header) =>
              header.id === id ? { ...header, name: NotValidated({ value }) } : header,
            ),
          }),
      }),
    }),

    UpdatedHeaderValue: ({ id, value }) => ({
      model: evo(model, {
        form: (form) =>
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

    CompletedRegisterMonitor: ({ monitor }) =>
      foldShowToast(insertMonitor(model, monitor), {
        variant: 'Success',
        payload: { message: 'Monitor created' },
      }),

    FailedRegisterMonitor: ({ error }) =>
      foldShowToast(model, { variant: 'Error', payload: { message: error } }),

    GotToastMessage: ({ message: toastMessage }) => foldToast(model, toastMessage),
  })

// VIEW

const LABEL_CLASS = 'block text-sm font-medium text-gray-700'
const INPUT_CLASS =
  'w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const SELECT_CLASS =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const ERROR_CLASS = 'text-sm text-red-600'
const BUTTON_CLASS =
  'rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY_BUTTON_CLASS = `${BUTTON_CLASS} bg-blue-600 text-white hover:bg-blue-700`
const SECONDARY_BUTTON_CLASS = `${BUTTON_CLASS} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`
const CLOSE_BUTTON_CLASS = 'rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
const DIALOG_CLASS = 'fixed inset-0 z-50 grid place-items-center p-4'
const BACKDROP_CLASS = 'fixed inset-0 bg-black/40'
const PANEL_CLASS = 'relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl'

const inputClass = (field: Field<string>): string =>
  field._tag === 'Invalid' ? `${INPUT_CLASS} border-red-500` : `${INPUT_CLASS} border-gray-300`

const fieldError = (
  field: Field<string>,
  descriptionAttributes: ReadonlyArray<Attribute<Message>>,
  h: HtmlBuilder<Message>,
): Html =>
  FieldValidation.match(field, {
    onNotValidated: () => h.empty,
    onValidating: () => h.empty,
    onValid: () => h.empty,
    onInvalid: ({ errors }) =>
      h.span([...descriptionAttributes, h.Class(ERROR_CLASS)], [Array.headNonEmpty(errors)]),
  })

const fieldInput = (
  id: string,
  labelText: string,
  field: Field<string>,
  onInput: (value: string) => Message,
  type: string,
  h: HtmlBuilder<Message>,
): Html =>
  Input.view(
    {
      id,
      value: field.value,
      onInput,
      isInvalid: field._tag === 'Invalid',
      hasDescription: field._tag === 'Invalid',
      type,
      toView: (attributes) =>
        h.div(
          [h.Class('space-y-1')],
          [
            h.label([...attributes.label, h.Class(LABEL_CLASS)], [labelText]),
            h.input([...attributes.input, h.Class(inputClass(field))]),
            fieldError(field, attributes.description, h),
          ],
        ),
    },
    h,
  )

const plainInput = (
  id: string,
  labelText: string,
  value: string,
  onInput: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Input.view(
    {
      id,
      value,
      onInput,
      toView: (attributes) =>
        h.div(
          [h.Class('space-y-1')],
          [
            h.label([...attributes.label, h.Class(LABEL_CLASS)], [labelText]),
            h.input([...attributes.input, h.Class(`${INPUT_CLASS} border-gray-300`)]),
          ],
        ),
    },
    h,
  )

const selectInput = (
  id: string,
  labelText: string,
  value: string,
  options: ReadonlyArray<string>,
  onChange: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Select.view(
    {
      id,
      value,
      onChange,
      toView: (attributes) =>
        h.div(
          [h.Class('space-y-1')],
          [
            h.label([...attributes.label, h.Class(LABEL_CLASS)], [labelText]),
            h.select(
              [...attributes.select, h.Class(SELECT_CLASS)],
              Array.map(options, (option) => h.option([h.Value(option)], [option])),
            ),
          ],
        ),
    },
    h,
  )

const headerRowView = (header: HeaderRow, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    header.id,
    [h.Class('flex items-end gap-2')],
    [
      h.div(
        [h.Class('flex-1')],
        [
          fieldInput(
            `${header.id}-name`,
            'Header name',
            header.name,
            (value) => Message.UpdatedHeaderName({ id: header.id, value }),
            'text',
            h,
          ),
        ],
      ),
      h.div(
        [h.Class('flex-1')],
        [
          fieldInput(
            `${header.id}-value`,
            'Header value',
            header.value,
            (value) => Message.UpdatedHeaderValue({ id: header.id, value }),
            'text',
            h,
          ),
        ],
      ),
      Button.view(
        {
          onClick: Message.ClickedRemoveHeader({ id: header.id }),
          toView: (attributes) =>
            h.button([...attributes.button, h.Class(SECONDARY_BUTTON_CLASS)], ['Remove']),
        },
        h,
      ),
    ],
  )

const headersInput = (form: Form, h: HtmlBuilder<Message>): Html =>
  h.fieldset(
    [h.Class('space-y-2')],
    [
      h.legend([h.Class(LABEL_CLASS)], ['Headers']),
      ...Array.map(form.headers, (header) => headerRowView(header, h)),
      Button.view(
        {
          onClick: Message.ClickedAddHeader(),
          toView: (attributes) =>
            h.button([...attributes.button, h.Class(SECONDARY_BUTTON_CLASS)], ['Add header']),
        },
        h,
      ),
    ],
  )

const addMonitorForm = (
  model: Model,
  closeButton: ReadonlyArray<ChildAttribute>,
  h: HtmlBuilder<Message>,
): Html =>
  h.form(
    [h.Class('mt-4 space-y-4'), h.OnSubmit(Message.ClickedCreateMonitor())],
    [
      fieldInput(
        'monitor-hostname',
        'Hostname',
        model.form.hostname,
        (value) => Message.UpdatedHostname({ value }),
        'text',
        h,
      ),
      fieldInput(
        'monitor-port',
        'Port',
        model.form.port,
        (value) => Message.UpdatedPort({ value }),
        'text',
        h,
      ),
      selectInput(
        'monitor-protocol',
        'Protocol',
        model.form.protocol,
        ['http', 'https'],
        (protocol) => Message.UpdatedProtocol({ protocol: toProtocol(protocol) }),
        h,
      ),
      selectInput(
        'monitor-method',
        'Method',
        model.form.method,
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        (method) =>
          Message.UpdatedMethod({
            method: Schema.decodeSync(HttpMethod)(method),
          }),
        h,
      ),
      plainInput(
        'monitor-path',
        'Path (optional)',
        model.form.path,
        (value) => Message.UpdatedPath({ value }),
        h,
      ),
      fieldInput(
        'monitor-cron',
        'Cron schedule',
        model.form.cronSchedule,
        (value) => Message.UpdatedCronSchedule({ value }),
        'text',
        h,
      ),
      headersInput(model.form, h),
      h.div(
        [h.Class('flex justify-end gap-2 pt-2')],
        [
          h.button([...closeButton, h.Class(SECONDARY_BUTTON_CLASS)], ['Cancel']),
          Button.view(
            {
              type: 'submit',
              toView: (attributes) =>
                h.button([...attributes.button, h.Class(PRIMARY_BUTTON_CLASS)], ['Create monitor']),
            },
            h,
          ),
        ],
      ),
    ],
  )

// NOTE: Foldkit 0.160.0 has no `isDismissible` flag on Dialog, so Escape and
// backdrop dismissal are disabled by filtering those two attribute handlers out
// of the framework's bundles. Drop this once Dialog exposes the flag.
const isEscapeToClose = (attribute: ChildAttribute): boolean =>
  Predicate.isTagged(attribute.attribute, 'OnCancelPreventDefault')

const isBackdropToClose = (attribute: ChildAttribute): boolean =>
  Predicate.isTagged(attribute.attribute, 'OnClick')

const addMonitorDialog = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.dialog.id,
    model: model.dialog,
    view: Dialog.view,
    viewInputs: {
      hasDescription: true,
      toView: ({ dialog, backdrop, panel, title, description, closeButton, isVisible }) => {
        const dialogAttributes = Array.filter(dialog, (attribute) => !isEscapeToClose(attribute))

        if (!isVisible) {
          return h.dialog(dialogAttributes)
        }

        return h.dialog(
          [...dialogAttributes, h.Class(DIALOG_CLASS)],
          [
            h.div([
              ...Array.filter(backdrop, (attribute) => !isBackdropToClose(attribute)),
              h.Class(BACKDROP_CLASS),
            ]),
            h.div(
              [...panel, h.Class(PANEL_CLASS)],
              [
                h.div(
                  [h.Class('flex items-start justify-between gap-4')],
                  [
                    h.h2([...title, h.Class('text-lg font-semibold')], ['Add monitor']),
                    h.button(
                      [...closeButton, h.Class(CLOSE_BUTTON_CLASS), h.AriaLabel('Close')],
                      ['×'],
                    ),
                  ],
                ),
                h.p(
                  [...description, h.Class('mt-1 text-sm text-gray-500')],
                  ['Configure an HTTP check on a cron schedule.'],
                ),
                addMonitorForm(model, closeButton, h),
              ],
            ),
          ],
        )
      },
    },
    toParentMessage: (message) => Message.GotAddMonitorDialogMessage({ message }),
  })

const monitorUrl = (monitor: Monitor): string => {
  const path = monitor.request.path === undefined ? '' : monitor.request.path
  return `${monitor.request.protocol}://${monitor.request.hostname}:${monitor.request.port}${path}`
}

const monitorRow = (monitor: Monitor, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')(
    monitor.id,
    [h.Class('rounded-lg border border-gray-200 bg-white p-4')],
    [
      h.div(
        [h.Class('flex items-center gap-3')],
        [
          h.span(
            [h.Class('rounded bg-gray-100 px-2 py-0.5 font-mono text-xs')],
            [monitor.request.method],
          ),
          h.span([h.Class('font-medium')], [monitorUrl(monitor)]),
        ],
      ),
      h.dl(
        [h.Class('mt-2 grid grid-cols-2 gap-1 text-sm text-gray-600')],
        [
          h.dt([], ['Schedule']),
          h.dd([], [Cron.format(monitor.cronSchedule)]),
          h.dt([], ['Created']),
          h.dd([], [new Date(monitor.createdAt).toLocaleString()]),
        ],
      ),
    ],
  )

const monitorsSection = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchDataSplitEmpty(model.monitors, {
    onIdle: () => h.empty,
    onLoading: () => h.p([h.Class('text-sm text-gray-500')], ['Loading monitors...']),
    onFailure: (error) =>
      h.div(
        [h.Class('rounded-lg border border-red-300 bg-red-50 p-4')],
        [
          h.p([h.Class('text-sm text-red-700')], [`Could not load monitors: ${error}`]),
          Button.view(
            {
              onClick: Message.ClickedRetryListMonitors(),
              toView: (attributes) =>
                h.button([...attributes.button, h.Class(PRIMARY_BUTTON_CLASS)], ['Retry']),
            },
            h,
          ),
        ],
      ),
    onData: (monitors) =>
      Array.match(monitors, {
        onEmpty: () =>
          h.p([h.Class('text-sm text-gray-500')], ['No monitors yet. Add one to get started.']),
        onNonEmpty: (monitors) =>
          h.ul(
            [h.Class('space-y-3')],
            Array.map(monitors, (monitor) => monitorRow(monitor, h)),
          ),
      }),
  })

const toastView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.toast.id,
    model: model.toast,
    view: Toast.view,
    viewInputs: {
      position: 'BottomRight',
      entryClassName: 'w-80',
      entryToView: (entry, handlers) =>
        h.div(
          [
            h.Class(
              'flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg',
            ),
          ],
          [
            h.p([h.Class('flex-1 text-sm text-gray-800')], [entry.payload.message]),
            h.button([...handlers.dismiss, h.Class(CLOSE_BUTTON_CLASS)], ['Dismiss']),
          ],
        ),
    },
    toParentMessage: (message) => Message.GotToastMessage({ message }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: APP_NAME,
  body: h.div(
    [h.Class('min-h-screen bg-gray-50 text-gray-900')],
    [
      h.header(
        [h.Class('border-b border-gray-200 bg-white')],
        [
          h.div(
            [h.Class('mx-auto flex max-w-3xl items-center justify-between px-4 py-4')],
            [
              h.h1([h.Class('text-lg font-semibold')], [APP_NAME]),
              Button.view(
                {
                  onClick: Message.ClickedOpenAddMonitor(),
                  toView: (attributes) =>
                    h.button(
                      [...attributes.button, h.Class(PRIMARY_BUTTON_CLASS)],
                      ['Add monitor'],
                    ),
                },
                h,
              ),
            ],
          ),
        ],
      ),
      h.main([h.Class('mx-auto max-w-3xl px-4 py-8')], [monitorsSection(model, h)]),
      addMonitorDialog(model, h),
      toastView(model, h),
    ],
  ),
})
