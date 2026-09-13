import { MonitorDefinition } from '@uptime-watchdog/common'
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
