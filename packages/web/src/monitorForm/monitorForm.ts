import {
  CronExpression,
  HttpMethod,
  Monitor,
  MonitorName,
  type MonitorDefinition,
  Protocol,
} from '@uptime-watchdog/common'
import { Array, Cron, Option, Result, Schema } from 'effect'
import {
  Field,
  Invalid,
  NotValidated,
  Rule,
  allValid,
  makeRules,
  validate,
} from 'foldkit/fieldValidation'

// FIELD VALIDATION

const isBlank = (value: string): boolean => value.trim() === ''

export const parseCron = (expression: string): Option.Option<Cron.Cron> =>
  Cron.parse(expression.trim()).pipe(
    Result.match({
      onFailure: () => Option.none(),
      onSuccess: (cron) => Option.some(cron),
    }),
  )

const hostnameRules = makeRules({
  required: 'Hostname is required',
  isEmpty: isBlank,
})

export const monitorNameCount = (value: string): number => value.trim().length

export const isMonitorNameTooLong = (value: string): boolean =>
  monitorNameCount(value) > 0 && Option.isNone(Schema.decodeUnknownOption(MonitorName)(value))

const nameRules = makeRules({
  required: 'Name is required',
  isEmpty: isBlank,
  rules: [Rule.fromSchema(MonitorName, 'Name must be 128 characters or fewer')],
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

export const Form = Schema.Struct({
  name: Field(Schema.String),
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

const emptyField = () => NotValidated({ value: '' })

export const makeInitialForm = (): Form => ({
  name: emptyField(),
  hostname: emptyField(),
  port: emptyField(),
  protocol: 'https',
  method: 'GET',
  path: '',
  cronSchedule: emptyField(),
  headers: [],
  headerSequence: 0,
})

export const formForMonitor = (monitor: Monitor): Form => {
  const headers = Array.map(Object.entries(monitor.request.headers), ([name, value], index) => ({
    id: `header-${index}`,
    name: NotValidated({ value: name }),
    value: NotValidated({ value }),
  }))

  return {
    name: NotValidated({ value: monitor.name }),
    hostname: NotValidated({ value: monitor.request.hostname }),
    port: NotValidated({ value: String(monitor.request.port) }),
    protocol: monitor.request.protocol,
    method: monitor.request.method,
    path: monitor.request.path ?? '',
    cronSchedule: NotValidated({ value: Cron.format(monitor.cronSchedule) }),
    headers,
    headerSequence: headers.length,
  }
}

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

export const validateForm = (form: Form): Readonly<{ form: Form; isValid: boolean }> => {
  const name = validate(nameRules)(form.name.value)
  const hostname = validate(hostnameRules)(form.hostname.value)
  const port = validate(portRules)(form.port.value)
  const cronSchedule = validate(cronScheduleRules)(form.cronSchedule.value)
  const headers = validateHeaderRows(form.headers)

  const isValid =
    allValid([
      [name, nameRules],
      [hostname, hostnameRules],
      [port, portRules],
      [cronSchedule, cronScheduleRules],
    ]) && headers.isValid

  return {
    form: { ...form, name, hostname, port, cronSchedule, headers: headers.headers },
    isValid,
  }
}

export const toMonitorDefinition = (form: Form): MonitorDefinition => {
  const headers = Object.fromEntries(
    Array.map(form.headers, (header) => [header.name.value.trim(), header.value.value.trim()]),
  )
  const trimmedPath = form.path.trim()

  return {
    name: Schema.decodeSync(MonitorName)(form.name.value),
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

export const toProtocol = (value: string): Protocol => (value === 'http' ? 'http' : 'https')
