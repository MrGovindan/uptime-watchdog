import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import { APP_NAME } from '../constant'
import * as CronHelp from '../cronHelp'
import { Message } from '../message'
import type { Model } from '../model'
import { addMonitorDialog, deleteMonitorDialog } from './dialogs'
import { primaryButton } from './field'
import { monitorsSection, notificationTargetsView, toastView } from './monitors'

const cronHelpView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.cronHelp.dialog.id,
    model: model.cronHelp,
    view: CronHelp.view,
    toParentMessage: (message) => Message.GotCronHelpMessage({ message }),
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
              h.div(
                [h.Class('flex items-center gap-2')],
                [
                  h.img([h.Src('/icon-192.png'), h.Alt(''), h.Class('h-12 w-12')]),
                  h.h1([h.Class('text-lg font-semibold')], [APP_NAME]),
                ],
              ),
              primaryButton({ onClick: Message.ClickedOpenAddMonitor(), label: 'Add monitor' }, h),
            ],
          ),
        ],
      ),
      h.main([h.Class('mx-auto max-w-3xl px-4 py-8')], [monitorsSection(model, h)]),
      addMonitorDialog(model, h),
      deleteMonitorDialog(model, h),
      notificationTargetsView(model, h),
      cronHelpView(model, h),
      toastView(model, h),
    ],
  ),
})
