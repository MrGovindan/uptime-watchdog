import { Dialog } from '@foldkit/ui'
import { Array, Option, Predicate } from 'effect'
import type { ChildAttribute, Html, HtmlBuilder } from 'foldkit/html'

import { Message } from '../message'
import type { Model } from '../model'
import { addMonitorForm } from './addMonitorForm'
import {
  BACKDROP_CLASS,
  CLOSE_BUTTON_CLASS,
  DIALOG_CLASS,
  PANEL_CLASS,
  dangerButton,
  secondaryButton,
} from './field'

// NOTE: Foldkit 0.160.0 has no `isDismissible` flag on Dialog, so Escape and
// backdrop dismissal are disabled by filtering those two attribute handlers out
// of the framework's bundles. Drop this once Dialog exposes the flag.
const isEscapeToClose = (attribute: ChildAttribute): boolean =>
  Predicate.isTagged(attribute.attribute, 'OnCancelPreventDefault')

const isBackdropToClose = (attribute: ChildAttribute): boolean =>
  Predicate.isTagged(attribute.attribute, 'OnClick')

export const addMonitorDialog = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isEditing = Option.isSome(model.editingMonitorId)

  return h.submodel({
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
                    h.h2(
                      [...title, h.Class('text-lg font-semibold')],
                      [isEditing ? 'Edit monitor' : 'Add monitor'],
                    ),
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
}

export const deleteMonitorDialog = (model: Model, h: HtmlBuilder<Message>): Html => {
  const monitorName = Option.match(model.maybeDeleteMonitor, {
    onNone: () => 'this monitor',
    onSome: (monitor) => monitor.name,
  })

  return h.submodel({
    slotId: model.deleteDialog.id,
    model: model.deleteDialog,
    view: Dialog.view,
    viewInputs: {
      hasDescription: true,
      toView: ({ dialog, backdrop, panel, title, description, closeButton, isVisible }) => {
        if (!isVisible) {
          return h.dialog([...dialog])
        }

        return h.dialog(
          [...dialog, h.Class(DIALOG_CLASS)],
          [
            h.div([...backdrop, h.Class(BACKDROP_CLASS)]),
            h.div(
              [...panel, h.Class(PANEL_CLASS)],
              [
                h.div(
                  [h.Class('flex items-start justify-between gap-4')],
                  [
                    h.h2([...title, h.Class('text-lg font-semibold')], ['Delete monitor']),
                    h.button(
                      [...closeButton, h.Class(CLOSE_BUTTON_CLASS), h.AriaLabel('Close')],
                      ['×'],
                    ),
                  ],
                ),
                h.p(
                  [...description, h.Class('mt-1 text-sm text-gray-500')],
                  [`Delete ${monitorName}? Its notification targets will also be removed.`],
                ),
                h.div(
                  [h.Class('mt-4 flex justify-end gap-2')],
                  [
                    secondaryButton(Message.ClickedCancelDeleteMonitor(), 'Cancel', h),
                    dangerButton(Message.ClickedConfirmDeleteMonitor(), 'Delete', h),
                  ],
                ),
              ],
            ),
          ],
        )
      },
    },
    toParentMessage: (message) => Message.GotDeleteMonitorDialogMessage({ message }),
  })
}
