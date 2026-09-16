import { HttpMethod, MONITOR_NAME_MAX_LENGTH } from '@uptime-watchdog/common'
import { Array, Option, Schema } from 'effect'
import type { ChildAttribute, Html, HtmlBuilder } from 'foldkit/html'

import { describeCron } from '../cronDescription'
import { Message } from '../message'
import {
  type Form,
  type HeaderRow,
  isMonitorNameTooLong,
  monitorNameCount,
  parseCron,
  toProtocol,
} from '../monitorForm'
import type { Model } from '../model'
import {
  SECONDARY_BUTTON_CLASS,
  fieldInput,
  plainInput,
  primaryButton,
  secondaryButton,
  selectInput,
} from './field'

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
      secondaryButton(Message.ClickedRemoveHeader({ id: header.id }), 'Remove', h),
    ],
  )

const headersInput = (form: Form, h: HtmlBuilder<Message>): Html =>
  h.fieldset(
    [h.Class('space-y-2')],
    [
      h.legend([h.Class('block text-sm font-medium text-gray-700')], ['Headers']),
      ...Array.map(form.headers, (header) => headerRowView(header, h)),
      secondaryButton(Message.ClickedAddHeader(), 'Add header', h),
    ],
  )

export const addMonitorForm = (
  model: Model,
  closeButton: ReadonlyArray<ChildAttribute>,
  h: HtmlBuilder<Message>,
): Html => {
  const isEditing = Option.isSome(model.editingMonitorId)

  return h.form(
    [
      h.Class('mt-4 space-y-4'),
      h.OnSubmit(isEditing ? Message.ClickedUpdateMonitor() : Message.ClickedCreateMonitor()),
    ],
    [
      fieldInput(
        'monitor-name',
        'Name',
        model.form.name,
        (value) => Message.UpdatedName({ value }),
        'text',
        h,
        {
          counter: {
            text: `${monitorNameCount(model.form.name.value)}/${MONITOR_NAME_MAX_LENGTH}`,
            isInvalid: isMonitorNameTooLong(model.form.name.value),
          },
        },
      ),
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
        {
          ...Option.match(parseCron(model.form.cronSchedule.value), {
            onNone: () => ({ error: 'Enter a valid cron expression' }),
            onSome: (cron) => ({ description: describeCron(cron) }),
          }),
          labelExtra: h.button(
            [
              h.Class('cursor-pointer text-xs text-gray-400 underline hover:text-gray-600'),
              h.Type('button'),
              h.OnClick(Message.ClickedOpenCronHelp()),
            ],
            ['Need help with this?'],
          ),
        },
      ),
      fieldInput(
        'monitor-expected-status',
        'Expected status',
        model.form.expectedStatus,
        (value) => Message.UpdatedExpectedStatus({ value }),
        'text',
        h,
      ),
      headersInput(model.form, h),
      h.div(
        [h.Class('flex justify-end gap-2 pt-2')],
        [
          h.button([...closeButton, h.Class(SECONDARY_BUTTON_CLASS)], ['Cancel']),
          primaryButton(
            {
              type: 'submit',
              label: isEditing ? 'Save changes' : 'Create monitor',
            },
            h,
          ),
        ],
      ),
    ],
  )
}
