import { MonitorId } from '@uptime-watchdog/common'
import { Duration, Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import { ApiClient } from '../apiClient'
import { Message } from './message'

const SEARCH_DEBOUNCE_MILLIS = 250

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const LoadNotificationTargets = Command.define('LoadNotificationTargets', {
  args: { monitorId: MonitorId },
  messages: [Message.CompletedLoadNotificationTargets, Message.FailedLoadNotificationTargets],
  execute: ({ monitorId }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const targets = yield* client.monitor.listNotificationTargets({ params: { monitorId } })
      return Message.CompletedLoadNotificationTargets({ targets })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedLoadNotificationTargets({ error: describeError(error) })),
      ),
    ),
})

export const SearchMattermostUsers = Command.define('SearchMattermostUsers', {
  args: { term: Schema.String, version: Schema.Number },
  messages: [Message.CompletedSearchMattermostUsers, Message.FailedSearchMattermostUsers],
  execute: ({ term, version }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      yield* Effect.sleep(Duration.millis(SEARCH_DEBOUNCE_MILLIS))
      const users = yield* client.notification.searchMattermostUsers({ payload: { term } })
      return Message.CompletedSearchMattermostUsers({ term, version, users })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          Message.FailedSearchMattermostUsers({ term, version, error: describeError(error) }),
        ),
      ),
    ),
})

export const AddNotificationTarget = Command.define('AddNotificationTarget', {
  args: { monitorId: MonitorId, mattermostUserId: Schema.String },
  messages: [Message.CompletedAddNotificationTarget, Message.FailedAddNotificationTarget],
  execute: ({ monitorId, mattermostUserId }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const target = yield* client.monitor.addNotificationTarget({
        params: { monitorId },
        payload: { mattermostUserId },
      })
      return Message.CompletedAddNotificationTarget({ target })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedAddNotificationTarget({ error: describeError(error) })),
      ),
    ),
})

export const RemoveNotificationTarget = Command.define('RemoveNotificationTarget', {
  args: { monitorId: MonitorId, mattermostUserId: Schema.String },
  messages: [Message.CompletedRemoveNotificationTarget, Message.FailedRemoveNotificationTarget],
  execute: ({ monitorId, mattermostUserId }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      yield* client.monitor.removeNotificationTarget({ params: { monitorId, mattermostUserId } })
      return Message.CompletedRemoveNotificationTarget({ mattermostUserId })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedRemoveNotificationTarget({ error: describeError(error) })),
      ),
    ),
})

export const SendTestNotification = Command.define('SendTestNotification', {
  args: { monitorId: Schema.optional(MonitorId), mattermostUserId: Schema.String },
  messages: [Message.CompletedSendTestNotification, Message.FailedSendTestNotification],
  execute: ({ monitorId, mattermostUserId }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      yield* client.notification.sendMattermostTest({
        payload: {
          mattermostUserId,
          ...(monitorId === undefined ? {} : { monitorId }),
        },
      })
      return Message.CompletedSendTestNotification()
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedSendTestNotification({ error: describeError(error) })),
      ),
    ),
})
