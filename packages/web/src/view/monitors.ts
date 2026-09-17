import { Button } from '@foldkit/ui'
import { Monitor, MonitorHealth, MonitorWithHealth } from '@uptime-watchdog/common'
import { Array, DateTime, Duration, Option } from 'effect'
import { AsyncData } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { describeCron } from '../cronDescription'
import { Message } from '../message'
import type { Model } from '../model'
import * as NotificationTargets from '../notificationTargets'
import { Toast } from '../toast'
import { CLOSE_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, dangerButton, secondaryButton } from './field'

const monitorUrl = (monitor: Monitor): string => {
  const path = monitor.request.path === undefined ? '' : monitor.request.path
  return `${monitor.request.protocol}://${monitor.request.hostname}:${monitor.request.port}${path}`
}

type HttpClientErrorKind =
  | 'EncodeError'
  | 'DecodeError'
  | 'TransportError'
  | 'InvalidUrlError'
  | 'StatusCodeError'
  | 'EmptyBodyError'

const ERROR_PHRASES: Record<HttpClientErrorKind, string> = {
  EncodeError: 'Could not encode the request',
  DecodeError: 'Could not decode the response',
  TransportError: 'Connection failed',
  InvalidUrlError: 'Invalid URL',
  StatusCodeError: 'Unexpected status',
  EmptyBodyError: 'Empty response body',
}

const formatTimestamp = (time: DateTime.Utc): string =>
  DateTime.formatLocal(DateTime.makeUnsafe(time), {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })

const describeCause = (cause: unknown): string => {
  if (cause === undefined || cause === null) return 'Unknown cause'
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string') return cause
  return JSON.stringify(cause) ?? String(cause)
}

type StatusStyle = Readonly<{ dot: string; pill: string; label: string }>

const HEALTHY_STYLE: StatusStyle = {
  dot: 'bg-green-500',
  pill: 'bg-green-50 text-green-700',
  label: 'Healthy',
}

const DEGRADED_STYLE: StatusStyle = {
  dot: 'bg-red-500',
  pill: 'bg-red-50 text-red-700',
  label: 'Degraded',
}

const PENDING_STYLE: StatusStyle = {
  dot: 'bg-gray-400',
  pill: 'bg-gray-100 text-gray-600',
  label: 'Awaiting first check',
}

const statusStyle = (health: Option.Option<MonitorHealth>): StatusStyle =>
  Option.match(health, {
    onNone: () => PENDING_STYLE,
    onSome: (value) => (value._tag === 'Healthy' ? HEALTHY_STYLE : DEGRADED_STYLE),
  })

const statusBadge = (style: StatusStyle, h: HtmlBuilder<Message>): Html =>
  h.span(
    [
      h.Class(
        `inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.pill}`,
      ),
    ],
    [
      h.span([h.Class(`h-1.5 w-1.5 rounded-full ${style.dot}`), h.AriaHidden(true)], []),
      style.label,
    ],
  )

const statusSummary = (entry: MonitorWithHealth, h: HtmlBuilder<Message>): Html => {
  const { monitor, health } = entry
  if (Option.isNone(health)) return h.empty

  const value = health.value
  const outcome =
    value._tag === 'Healthy'
      ? `${value.response.status} in ${Duration.format(value.response.duration)}`
      : value.reason._tag === 'Unexpected'
        ? `Expected ${monitor.expectedStatus}, got ${value.reason.response.status}`
        : ERROR_PHRASES[value.reason.error.kind]

  return h.p(
    [h.Class('mt-2 text-sm text-gray-600')],
    [
      h.span([], [outcome]),
      h.span([h.Class('text-gray-500')], [` · checked ${formatTimestamp(value.time)}`]),
    ],
  )
}

const detailRow = (label: string, value: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('grid grid-cols-[7rem_1fr] gap-1 py-0.5')],
    [h.dt([h.Class('text-gray-500')], [label]), h.dd([h.Class('break-words')], [value])],
  )

const degradedDetails = (entry: MonitorWithHealth, h: HtmlBuilder<Message>): Html => {
  const { monitor, health } = entry
  if (Option.isNone(health) || health.value._tag !== 'Degraded') return h.empty

  const value = health.value
  const reason = value.reason

  if (reason._tag === 'Error') {
    return h.details(
      [h.Class('mt-2 text-sm text-gray-600')],
      [
        h.summary(
          [h.Class('cursor-pointer select-none text-gray-500 hover:text-gray-700')],
          ['Response details'],
        ),
        h.dl(
          [h.Class('mt-2')],
          [
            detailRow('Reason', ERROR_PHRASES[reason.error.kind], h),
            detailRow('Cause', describeCause(reason.error.cause), h),
            detailRow('Checked', formatTimestamp(value.time), h),
          ],
        ),
      ],
    )
  }

  return h.details(
    [h.Class('mt-2 text-sm text-gray-600')],
    [
      h.summary(
        [h.Class('cursor-pointer select-none text-gray-500 hover:text-gray-700')],
        ['Response details'],
      ),
      h.dl(
        [h.Class('mt-2')],
        [
          detailRow('Reason', 'Unexpected status', h),
          detailRow('Expected', String(monitor.expectedStatus), h),
          detailRow('Received', String(reason.response.status), h),
          detailRow('Response time', Duration.format(reason.response.duration), h),
          detailRow('Checked', formatTimestamp(value.time), h),
          h.div(
            [h.Class('grid grid-cols-[7rem_1fr] gap-1 py-0.5')],
            [
              h.dt([h.Class('text-gray-500')], ['Response body']),
              h.dd(
                [],
                [
                  h.pre(
                    [
                      h.Class(
                        'mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-xs',
                      ),
                    ],
                    [reason.response.body === '' ? '(empty)' : reason.response.body],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

const monitorRow = (entry: MonitorWithHealth, h: HtmlBuilder<Message>): Html => {
  const { monitor } = entry

  return h.keyed('li')(
    monitor.id,
    [h.Class('rounded-lg border border-gray-200 bg-white p-4')],
    [
      h.div(
        [h.Class('flex items-start justify-between gap-3')],
        [
          h.div(
            [h.Class('flex flex-col gap-1')],
            [
              h.span([h.Class('font-medium')], [monitor.name]),
              h.div(
                [h.Class('flex items-center gap-3')],
                [
                  h.span(
                    [h.Class('rounded bg-gray-100 px-2 py-0.5 font-mono text-xs')],
                    [monitor.request.method],
                  ),
                  h.span([h.Class('text-sm text-gray-500')], [monitorUrl(monitor)]),
                ],
              ),
            ],
          ),
          statusBadge(statusStyle(entry.health), h),
        ],
      ),
      statusSummary(entry, h),
      degradedDetails(entry, h),
      h.dl(
        [h.Class('mt-2 grid grid-cols-2 gap-1 text-sm text-gray-600')],
        [
          h.dt([], ['Schedule']),
          h.dd([], [describeCron(monitor.cronSchedule)]),
          h.dt([], ['Created']),
          h.dd(
            [],
            [
              DateTime.formatLocal(DateTime.makeUnsafe(monitor.createdAt), {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('mt-3 flex flex-wrap gap-2')],
        [
          secondaryButton(
            Message.ClickedOpenNotificationTargets({
              monitorId: monitor.id,
              monitorName: monitor.name,
            }),
            'Notification targets',
            h,
          ),
          secondaryButton(Message.ClickedOpenEditMonitor({ monitor }), 'Edit', h),
          dangerButton(Message.ClickedRequestDeleteMonitor({ monitor }), 'Delete', h),
        ],
      ),
    ],
  )
}

export const monitorsSection = (model: Model, h: HtmlBuilder<Message>): Html =>
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
            Array.map(monitors, (entry) => monitorRow(entry, h)),
          ),
      }),
  })

export const notificationTargetsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.notificationTargets.dialog.id,
    model: model.notificationTargets,
    view: NotificationTargets.view,
    toParentMessage: (message) => Message.GotNotificationTargetsMessage({ message }),
  })

export const toastView = (model: Model, h: HtmlBuilder<Message>): Html =>
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
