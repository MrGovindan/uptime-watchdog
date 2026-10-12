import { type MattermostUser, MonitorId, MonitorName, NotificationTarget } from '@uptime-watchdog/common'
import { Option, Schema } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { expect, test } from 'vitest'

import * as NotificationTargets from './notificationTargets'
import {
  AddNotificationTarget,
  SearchMattermostUsers,
  UpdateNotificationTargetWindow,
} from './notificationTargets/command'

const monitorId = Schema.decodeSync(MonitorId)('3f2504e0-4f89-41d3-9a0c-0305e82c3301')
const monitorName = Schema.decodeSync(MonitorName)('Prod API')

const mattermostUser: MattermostUser = {
  id: 'mm-jesse',
  username: 'jesse',
  displayName: 'Jesse Duffield',
}

const target = Schema.decodeSync(NotificationTarget.json)({
  monitorId,
  mattermostUserId: mattermostUser.id,
  mattermostUsername: mattermostUser.username,
  mattermostDisplayName: mattermostUser.displayName,
  window: null,
  createdAt: '2026-09-14T00:00:00.000Z',
})

const windowedTarget = Schema.decodeSync(NotificationTarget.json)({
  monitorId,
  mattermostUserId: mattermostUser.id,
  mattermostUsername: mattermostUser.username,
  mattermostDisplayName: mattermostUser.displayName,
  window: {
    timezone: 'Europe/London',
    days: ['Monday', 'Tuesday'],
    startTime: '07:00',
    endTime: '17:00',
  },
  createdAt: '2026-09-14T00:00:00.000Z',
})

const openedModel = NotificationTargets.open(NotificationTargets.init().model, {
  monitorId,
  monitorName,
}).model

const searchingModel = NotificationTargets.update(
  openedModel,
  NotificationTargets.Message.UpdatedSearchTerm({ value: 'jes' }),
).model

test('opening the dialog loads the monitor targets', () => {
  const opened = NotificationTargets.open(NotificationTargets.init().model, {
    monitorId,
    monitorName,
  })

  expect(opened.model.targets._tag).toBe('Loading')
  expect(Option.isSome(opened.model.maybeMonitorId)).toBe(true)
})

test('loaded targets are stored', () => {
  story(
    NotificationTargets.update,
    given(openedModel),
    message(NotificationTargets.Message.CompletedLoadNotificationTargets({ targets: [target] })),
    model((current) => {
      expect(current.targets._tag).toBe('Success')
      if (current.targets._tag === 'Success') {
        expect(current.targets.data).toHaveLength(1)
      }
    }),
  )
})

test('a short search term dispatches no search', () => {
  story(
    NotificationTargets.update,
    given(openedModel),
    message(NotificationTargets.Message.UpdatedSearchTerm({ value: 'j' })),
    Command.expectNone(),
    model((current) => {
      expect(current.searchState._tag).toBe('Idle')
    }),
  )
})

test('a search term dispatches a debounced search', () => {
  story(
    NotificationTargets.update,
    given(openedModel),
    message(NotificationTargets.Message.UpdatedSearchTerm({ value: 'jes' })),
    Command.expectHas(SearchMattermostUsers),
    model((current) => {
      expect(current.searchState._tag).toBe('Loading')
      expect(current.searchVersion).toBe(1)
    }),
    Command.resolve(
      SearchMattermostUsers,
      NotificationTargets.Message.CompletedSearchMattermostUsers({
        term: 'jes',
        version: 1,
        users: [],
      }),
    ),
    model((current) => {
      expect(current.searchState._tag).toBe('Ok')
    }),
  )
})

test('a search result for the current version is shown', () => {
  story(
    NotificationTargets.update,
    given(searchingModel),
    message(
      NotificationTargets.Message.CompletedSearchMattermostUsers({
        term: 'jes',
        version: 1,
        users: [mattermostUser],
      }),
    ),
    model((current) => {
      expect(current.searchState._tag).toBe('Ok')
    }),
  )
})

test('a stale search result is discarded', () => {
  story(
    NotificationTargets.update,
    given(searchingModel),
    message(
      NotificationTargets.Message.CompletedSearchMattermostUsers({
        term: 'old',
        version: 0,
        users: [mattermostUser],
      }),
    ),
    model((current) => {
      expect(current.searchState._tag).toBe('Loading')
    }),
  )
})

test('adding a user dispatches an add and appends the created target', () => {
  story(
    NotificationTargets.update,
    given(openedModel),
    message(NotificationTargets.Message.ClickedAddNotificationTarget({ mattermostUser })),
    Command.expectHas(AddNotificationTarget),
    Command.resolve(AddNotificationTarget, NotificationTargets.Message.CompletedAddNotificationTarget({ target })),
    model((current) => {
      expect(current.targets._tag).toBe('Success')
      if (current.targets._tag === 'Success') {
        expect(current.targets.data).toEqual([target])
      }
      expect(current.searchTerm).toBe('')
    }),
  )
})

test('removing a target drops it from the list', () => {
  story(
    NotificationTargets.update,
    given(openedModel),
    message(NotificationTargets.Message.CompletedLoadNotificationTargets({ targets: [target] })),
    message(
      NotificationTargets.Message.CompletedRemoveNotificationTarget({
        mattermostUserId: mattermostUser.id,
      }),
    ),
    model((current) => {
      expect(current.targets._tag).toBe('Success')
      if (current.targets._tag === 'Success') {
        expect(current.targets.data).toEqual([])
      }
    }),
  )
})

test('opening the window editor seeds it from the target window', () => {
  const current = NotificationTargets.update(
    openedModel,
    NotificationTargets.Message.ClickedEditNotificationWindow({ target: windowedTarget }),
  ).model

  expect(Option.isSome(current.windowEditor)).toBe(true)
  if (Option.isSome(current.windowEditor)) {
    expect(current.windowEditor.value.mattermostUserId).toBe(mattermostUser.id)
    expect(current.windowEditor.value.startTime).toBe('07:00')
    expect(current.windowEditor.value.endTime).toBe('17:00')
    expect(current.windowEditor.value.timezone).toBe('Europe/London')
    expect(current.windowEditor.value.days).toEqual(['Monday', 'Tuesday'])
  }
})

test('toggling a day updates the editor days', () => {
  const withEditor = NotificationTargets.update(
    openedModel,
    NotificationTargets.Message.ClickedEditNotificationWindow({ target: windowedTarget }),
  ).model

  const current = NotificationTargets.update(
    withEditor,
    NotificationTargets.Message.ToggledNotificationWindowDay({ day: 'Wednesday' }),
  ).model

  expect(Option.isSome(current.windowEditor)).toBe(true)
  if (Option.isSome(current.windowEditor)) {
    expect(current.windowEditor.value.days).toContain('Wednesday')
    expect(current.windowEditor.value.days).toContain('Monday')
  }
})

test('saving a valid window dispatches an update', () => {
  const withEditor = NotificationTargets.update(
    openedModel,
    NotificationTargets.Message.ClickedEditNotificationWindow({ target: windowedTarget }),
  ).model

  story(
    NotificationTargets.update,
    given(withEditor),
    message(NotificationTargets.Message.ClickedSaveNotificationWindow()),
    Command.expectHas(UpdateNotificationTargetWindow),
    Command.resolve(
      UpdateNotificationTargetWindow,
      NotificationTargets.Message.CompletedUpdateNotificationTargetWindow({ target: windowedTarget }),
    ),
  )
})

test('a completed window update replaces the target', () => {
  const withEditor = NotificationTargets.update(
    NotificationTargets.update(
      openedModel,
      NotificationTargets.Message.CompletedLoadNotificationTargets({ targets: [target] }),
    ).model,
    NotificationTargets.Message.ClickedEditNotificationWindow({ target }),
  ).model

  story(
    NotificationTargets.update,
    given(withEditor),
    message(NotificationTargets.Message.CompletedUpdateNotificationTargetWindow({ target: windowedTarget })),
    model((current) => {
      expect(Option.isNone(current.windowEditor)).toBe(true)
      if (current.targets._tag === 'Success') {
        expect(current.targets.data).toEqual([windowedTarget])
      }
    }),
  )
})
