import { CronDescription } from '@uptime-watchdog/common'
import { Dialog, Input } from '@foldkit/ui'
import { Match, Option, Schema } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { describeCron } from '../cronDescription'
import { parseCron } from '../monitorForm'
import { Message } from './message'
import type { ConversionFailure, Model, State } from './model'

const LABEL_CLASS = 'block text-sm font-medium text-gray-700'
const INPUT_CLASS =
  'w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const ERROR_CLASS = 'text-sm text-red-600'
const THINKING_CLASS = 'text-sm italic text-gray-400'
const CRON_CODE_CLASS =
  'rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900'
const DESCRIPTION_CLASS = 'mt-1 text-sm text-gray-500'
const DIALOG_CLASS = 'fixed inset-0 z-50 grid place-items-center p-4'
const BACKDROP_CLASS = 'fixed inset-0 bg-black/40'
const PANEL_CLASS = 'relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl'
const CLOSE_BUTTON_CLASS = 'rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
const BUTTON_CLASS =
  'rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY_BUTTON_CLASS = `${BUTTON_CLASS} bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50`
const SECONDARY_BUTTON_CLASS = `${BUTTON_CLASS} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`

type Failure = ConversionFailure

const failureMessage = (failure: Failure): string =>
  Match.value(failure._tag).pipe(
    Match.withReturnType<string>(),
    Match.when('NotConvertible', () => "I couldn't turn that into a schedule. Try rephrasing it."),
    Match.when('Unavailable', () => 'This feature is unavailable right now.'),
    Match.when('TokensExhausted', () => 'This feature is out of tokens. Please try again later.'),
    Match.when('Unexpected', () => 'Something went wrong.'),
    Match.orElse(() => ''),
  )

const isConvertable = (description: string): boolean =>
  Option.isSome(Schema.decodeOption(CronDescription)(description))

const descriptionInput = (
  description: string,
  isDisabled: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  Input.view(
    {
      id: 'cron-description',
      value: description,
      isDisabled,
      ...(isDisabled ? {} : { onInput: (value) => Message.UpdatedDescription({ value }) }),
      placeholder: 'e.g. every weekday at 9am',
      toView: (attributes) =>
        h.div(
          [h.Class('space-y-1')],
          [
            h.input([
              ...attributes.input,
              h.AriaLabel('Schedule description'),
              h.Class(
                `${INPUT_CLASS} ${isDisabled ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-300'}`,
              ),
            ]),
          ],
        ),
    },
    h,
  )

// The dialog body renders one stable skeleton whose slots only change
// contents, never position or tag: [error, input, action]. Consistent tags at
// every index let the reconciler patch in place instead of moving or
// recreating the input, which would drop focus while the user types.
const dialogBody = (state: State, h: HtmlBuilder<Message>): Html => {
  if (state._tag === 'Result') {
    return resultView(state.cron, h)
  }

  const description = state.description

  return h.div(
    [h.Class('space-y-4')],
    [
      h.p([h.Class(ERROR_CLASS)], [state._tag === 'Failed' ? failureMessage(state.failure) : '']),
      descriptionInput(description, state._tag === 'Working', h),
      ...(state._tag === 'Entering'
        ? [
            h.button(
              [
                h.Class(PRIMARY_BUTTON_CLASS),
                h.Disabled(!isConvertable(state.description.trim())),
                h.Type('button'),
                h.OnClick(Message.ClickedConvert()),
              ],
              ['Convert'],
            ),
          ]
        : state._tag === 'Working'
          ? [h.p([h.Class(THINKING_CLASS)], [`${state.verb}...`])]
          : state.failure._tag === 'Unavailable'
            ? [
                h.button(
                  [
                    h.Class(SECONDARY_BUTTON_CLASS),
                    h.Type('button'),
                    h.OnClick(Message.ClickedRetry()),
                  ],
                  ['Try again'],
                ),
              ]
            : []),
    ],
  )
}

const resultView = (cron: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('space-y-4')],
    [
      h.div(
        [h.Class('space-y-1')],
        [
          h.span([h.Class(LABEL_CLASS)], ['Generated cron expression']),
          h.p([h.Class(CRON_CODE_CLASS)], [cron]),
          Option.match(parseCron(cron), {
            onNone: () => h.empty,
            onSome: (parsed) => h.p([h.Class(DESCRIPTION_CLASS)], [describeCron(parsed)]),
          }),
        ],
      ),
      h.button(
        [h.Class(PRIMARY_BUTTON_CLASS), h.Type('button'), h.OnClick(Message.ClickedAccept())],
        ['Accept'],
      ),
    ],
  )

const stateView = (state: State, h: HtmlBuilder<Message>): Html => dialogBody(state, h)

export const view = Submodel.defineView<Model, Message>((model, h): Html =>
  h.submodel({
    slotId: model.dialog.id,
    model: model.dialog,
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
                    h.h2([...title, h.Class('text-lg font-semibold')], ['Describe your schedule']),
                    h.button(
                      [...closeButton, h.Class(CLOSE_BUTTON_CLASS), h.AriaLabel('Close')],
                      ['×'],
                    ),
                  ],
                ),
                h.p(
                  [...description, h.Class(`${DESCRIPTION_CLASS} mb-4`)],
                  ['Describe when the check should run and I will turn it into a cron expression.'],
                ),
                stateView(model.state, h),
              ],
            ),
          ],
        )
      },
    },
    toParentMessage: (message) => Message.GotDialogMessage({ message }),
  }),
)
