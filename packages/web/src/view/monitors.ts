import { Button } from '@foldkit/ui'
import { Monitor } from '@uptime-watchdog/common'
import { Array, DateTime } from 'effect'
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

const monitorRow = (monitor: Monitor, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')(
    monitor.id,
    [h.Class('rounded-lg border border-gray-200 bg-white p-4')],
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
            Array.map(monitors, (monitor) => monitorRow(monitor, h)),
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
