import {
  type MattermostUser,
  type NotificationTarget,
  type NotificationWindow,
  type Weekday,
  WEEKDAY_NAMES,
} from '@uptime-watchdog/common'
import { Button, Dialog, Input } from '@foldkit/ui'
import { Array, Match, Option } from 'effect'
import { AsyncData, Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Message } from './message'
import type { Model, WindowEditor } from './model'
import { buildTimezoneOptions } from './timezoneOptions'

const LABEL_CLASS = 'block text-sm font-medium text-gray-700'
const INPUT_CLASS =
  'w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const ERROR_CLASS = 'text-sm text-red-600'
const HELPER_CLASS = 'text-sm text-gray-500'
const SUMMARY_CLASS = 'text-xs text-gray-500'
const SECTION_TITLE_CLASS = 'text-sm font-semibold text-gray-800'
const BUTTON_CLASS = 'rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500'
const SECONDARY_BUTTON_CLASS = `${BUTTON_CLASS} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`
const CLOSE_BUTTON_CLASS = 'rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
const DIALOG_CLASS = 'fixed inset-0 z-50 grid place-items-center p-4'
const BACKDROP_CLASS = 'fixed inset-0 bg-black/40'
const PANEL_CLASS = 'relative z-10 w-full max-w-xl rounded-xl bg-white p-6 shadow-xl'
const ROW_CLASS = 'flex items-center justify-between gap-3 rounded-md border border-gray-200 p-2'
const TARGET_ROW_CLASS = 'rounded-md border border-gray-200 p-2'
const EDITOR_CLASS = 'mt-2 space-y-3 border-t border-gray-200 pt-3'
const DAY_TOGGLE_CLASS = 'flex items-center gap-1 text-sm'
const FIELD_CLASS = 'flex-1'

const WEEKDAY_SHORT_NAMES: Record<Weekday, string> = {
  Sunday: 'Sun',
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
}

const windowSummary = (window: NotificationWindow | null): string => {
  if (window === null) {
    return 'Always'
  }

  const days = Array.join(', ')(Array.map(window.days, (day) => WEEKDAY_SHORT_NAMES[day]))

  return `${days} ${window.startTime}–${window.endTime} · ${window.timezone}`
}

const dayToggle = (editor: WindowEditor, day: Weekday, h: HtmlBuilder<Message>): Html =>
  h.keyed('label')(
    day,
    [h.Class(DAY_TOGGLE_CLASS)],
    [
      h.input([
        h.Type('checkbox'),
        h.Checked(Array.contains(editor.days, day)),
        h.OnInput(() => Message.ToggledNotificationWindowDay({ day })),
      ]),
      h.span([], [WEEKDAY_SHORT_NAMES[day]]),
    ],
  )

const timeField = (
  label: string,
  id: string,
  value: string,
  toMessage: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class(FIELD_CLASS)],
    [
      h.label([h.For(id), h.Class(LABEL_CLASS)], [label]),
      h.input([
        h.Id(id),
        h.Type('time'),
        h.Value(value),
        h.OnInput(toMessage),
        h.Class(`${INPUT_CLASS} border-gray-300`),
      ]),
    ],
  )

const windowEditorPanel = (editor: WindowEditor, currentTimezone: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(EDITOR_CLASS)],
    [
      h.div(
        [h.Class('flex flex-wrap gap-3')],
        Array.map(WEEKDAY_NAMES, (day) => dayToggle(editor, day, h)),
      ),
      h.div(
        [h.Class('flex gap-3')],
        [
          timeField(
            'Start time',
            'window-start-time',
            editor.startTime,
            (value) => Message.UpdatedNotificationWindowStartTime({ value }),
            h,
          ),
          timeField(
            'End time',
            'window-end-time',
            editor.endTime,
            (value) => Message.UpdatedNotificationWindowEndTime({ value }),
            h,
          ),
        ],
      ),
      h.div(
        [h.Class(FIELD_CLASS)],
        [
          h.label([h.For('window-timezone'), h.Class(LABEL_CLASS)], ['Timezone']),
          h.input([
            h.Id('window-timezone'),
            h.Type('text'),
            h.Value(editor.timezone),
            h.List('window-timezone-options'),
            h.OnInput((value) => Message.UpdatedNotificationWindowTimezone({ value })),
            h.Class(`${INPUT_CLASS} border-gray-300`),
          ]),
          h.datalist(
            [h.Id('window-timezone-options')],
            buildTimezoneOptions({ currentTimezone, selectedTimezone: editor.timezone }).map((option) =>
              h.option([h.Value(option.zone)], [option.label]),
            ),
          ),
          h.p([h.Class(HELPER_CLASS)], ['Leave blank to use your current timezone']),
        ],
      ),
      h.div(
        [h.Class('flex gap-2')],
        [
          h.button(
            [
              h.Class(`${BUTTON_CLASS} bg-blue-600 text-white hover:bg-blue-700`),
              h.Type('button'),
              h.OnClick(Message.ClickedSaveNotificationWindow()),
            ],
            ['Save'],
          ),
          h.button(
            [h.Class(SECONDARY_BUTTON_CLASS), h.Type('button'), h.OnClick(Message.ClickedClearNotificationWindow())],
            ['Always notify'],
          ),
          h.button(
            [h.Class(SECONDARY_BUTTON_CLASS), h.Type('button'), h.OnClick(Message.ClosedNotificationWindowEditor())],
            ['Cancel'],
          ),
        ],
      ),
    ],
  )

const targetRow = (target: NotificationTarget, model: Model, h: HtmlBuilder<Message>): Html => {
  const maybeEditor = Option.filter(model.windowEditor, (editor) => editor.mattermostUserId === target.mattermostUserId)

  return h.keyed('li')(
    target.mattermostUserId,
    [h.Class(TARGET_ROW_CLASS)],
    [
      h.div(
        [h.Class('flex items-center justify-between gap-3')],
        [
          h.div(
            [h.Class('min-w-0')],
            [
              h.p([h.Class('truncate text-sm font-medium')], [target.mattermostDisplayName]),
              h.p([h.Class('truncate text-xs text-gray-500')], [`@${target.mattermostUsername}`]),
              h.p([h.Class(SUMMARY_CLASS)], [windowSummary(target.window)]),
            ],
          ),
          h.div(
            [h.Class('flex shrink-0 gap-2')],
            [
              Button.view(
                {
                  onClick: Message.ClickedEditNotificationWindow({ target }),
                  toView: (attributes) =>
                    h.button([...attributes.button, h.Class(SECONDARY_BUTTON_CLASS)], ['Edit hours']),
                },
                h,
              ),
              Button.view(
                {
                  onClick: Message.ClickedRemoveNotificationTarget({
                    mattermostUserId: target.mattermostUserId,
                  }),
                  toView: (attributes) => h.button([...attributes.button, h.Class(SECONDARY_BUTTON_CLASS)], ['Remove']),
                },
                h,
              ),
            ],
          ),
        ],
      ),
      ...Option.match(maybeEditor, {
        onNone: () => [],
        onSome: (editor) => [windowEditorPanel(editor, model.currentTimezone, h)],
      }),
    ],
  )
}

const targetsSection = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Class('mt-4')],
    [
      h.h3([h.Class(SECTION_TITLE_CLASS)], ['Notified on disruption']),
      h.div(
        [h.Class('mt-2')],
        [
          AsyncData.matchDataSplitEmpty(model.targets, {
            onIdle: () => h.empty,
            onLoading: () => h.p([h.Class(HELPER_CLASS)], ['Loading notification targets...']),
            onFailure: (error) => h.p([h.Class(ERROR_CLASS)], [`Could not load notification targets: ${error}`]),
            onData: (targets) =>
              Array.match(targets, {
                onEmpty: () =>
                  h.p([h.Class(HELPER_CLASS)], ['No one is notified yet. Search for a Mattermost user below.']),
                onNonEmpty: (targets) =>
                  h.ul(
                    [h.Class('space-y-2')],
                    Array.map(targets, (target) => targetRow(target, model, h)),
                  ),
              }),
          }),
        ],
      ),
    ],
  )

const userResult = (user: MattermostUser, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')(
    user.id,
    [h.Class(ROW_CLASS)],
    [
      h.div(
        [h.Class('min-w-0')],
        [
          h.p([h.Class('truncate text-sm font-medium')], [user.displayName]),
          h.p([h.Class('truncate text-xs text-gray-500')], [`@${user.username}`]),
        ],
      ),
      Button.view(
        {
          onClick: Message.ClickedAddNotificationTarget({ mattermostUser: user }),
          toView: (attributes) => h.button([...attributes.button, h.Class(SECONDARY_BUTTON_CLASS)], ['Add']),
        },
        h,
      ),
    ],
  )

const searchResults = (model: Model, h: HtmlBuilder<Message>): Html =>
  Match.value(model.searchState).pipe(
    Match.withReturnType<Html>(),
    Match.tagsExhaustive({
      Idle: () => h.p([h.Class(HELPER_CLASS)], ['Type at least two characters to search.']),
      Loading: () => h.p([h.Class(HELPER_CLASS)], ['Searching Mattermost...']),
      Failed: ({ error }) => h.p([h.Class(ERROR_CLASS)], [error]),
      Ok: ({ users }) =>
        Array.match(users, {
          onEmpty: () => h.p([h.Class(HELPER_CLASS)], ['No matching Mattermost users.']),
          onNonEmpty: (users) =>
            h.ul(
              [h.Class('space-y-1')],
              Array.map(users, (user) => userResult(user, h)),
            ),
        }),
    }),
  )

const searchSection = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Class('mt-5')],
    [
      h.h3([h.Class(SECTION_TITLE_CLASS)], ['Add a Mattermost user']),
      Input.view(
        {
          id: 'mattermost-user-search',
          value: model.searchTerm,
          onInput: (value) => Message.UpdatedSearchTerm({ value }),
          toView: (attributes) =>
            h.div(
              [h.Class('mt-2 space-y-2')],
              [
                h.label([...attributes.label, h.Class(LABEL_CLASS)], ['Search Mattermost']),
                h.input([...attributes.input, h.Class(`${INPUT_CLASS} border-gray-300`)]),
              ],
            ),
        },
        h,
      ),
      searchResults(model, h),
    ],
  )

const errorBanner = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(model.maybeError, {
    onNone: () => h.empty,
    onSome: (error) => h.p([h.Class(`${ERROR_CLASS} mt-3`)], [error]),
  })

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

        const monitorLabel = Option.getOrElse(model.maybeMonitorName, () => 'this monitor')

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
                    h.h2([...title, h.Class('text-lg font-semibold')], ['Notification targets']),
                    h.button([...closeButton, h.Class(CLOSE_BUTTON_CLASS), h.AriaLabel('Close')], ['×']),
                  ],
                ),
                h.p(
                  [...description, h.Class(HELPER_CLASS)],
                  [`Mattermost users notified when ${monitorLabel} is disrupted.`],
                ),
                errorBanner(model, h),
                targetsSection(model, h),
                searchSection(model, h),
              ],
            ),
          ],
        )
      },
    },
    toParentMessage: (message) => Message.GotDialogMessage({ message }),
  }),
)
