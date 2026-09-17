import { MonitorDefinition, MonitorId } from '@uptime-watchdog/common'
import { Effect } from 'effect'
import { Command } from 'foldkit'

import { ApiClient } from './apiClient'
import { Message } from './message'

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const ListMonitors = Command.define('ListMonitors', {
  messages: [Message.CompletedListMonitors, Message.FailedListMonitors],
  execute: Effect.gen(function* () {
    const client = yield* ApiClient
    const monitors = yield* client.monitor.list()
    return Message.CompletedListMonitors({ monitors })
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(Message.FailedListMonitors({ error: describeError(error) })),
    ),
  ),
})

export const RegisterMonitor = Command.define('RegisterMonitor', {
  args: { definition: MonitorDefinition },
  messages: [Message.CompletedRegisterMonitor, Message.FailedRegisterMonitor],
  execute: ({ definition }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const monitor = yield* client.monitor.register({ payload: definition })
      return Message.CompletedRegisterMonitor({ monitor })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedRegisterMonitor({ error: describeError(error) })),
      ),
    ),
})

export const UpdateMonitor = Command.define('UpdateMonitor', {
  args: { monitorId: MonitorId, definition: MonitorDefinition },
  messages: [Message.CompletedUpdateMonitor, Message.FailedUpdateMonitor],
  execute: ({ monitorId, definition }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const monitor = yield* client.monitor.updateMonitor({
        params: { monitorId },
        payload: definition,
      })
      return Message.CompletedUpdateMonitor({ monitor })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedUpdateMonitor({ error: describeError(error) })),
      ),
    ),
})

export const DeleteMonitor = Command.define('DeleteMonitor', {
  args: { monitorId: MonitorId },
  messages: [Message.CompletedDeleteMonitor, Message.FailedDeleteMonitor],
  execute: ({ monitorId }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      yield* client.monitor.deleteMonitor({ params: { monitorId } })
      return Message.CompletedDeleteMonitor({ monitorId })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedDeleteMonitor({ error: describeError(error) })),
      ),
    ),
})
