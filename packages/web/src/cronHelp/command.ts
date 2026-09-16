import { CronDescription } from '@uptime-watchdog/common'
import { Cron, Effect } from 'effect'
import { Command } from 'foldkit'

import { ApiClient } from '../apiClient'
import { Message } from './message'
import { ConversionFailure } from './model'

const toFailure = (error: unknown): ConversionFailure => {
  switch ((error as { _tag?: string })._tag) {
    case 'ProviderUnavailable':
      return ConversionFailure.Unavailable()
    case 'TokensExhausted':
      return ConversionFailure.TokensExhausted()
    case 'DescriptionNotConvertible':
      return ConversionFailure.NotConvertible()
    default:
      return ConversionFailure.Unexpected()
  }
}

export const ConvertCronDescription = Command.define('ConvertCronDescription', {
  args: { description: CronDescription },
  messages: [Message.CompletedConvertCronDescription, Message.FailedConvertCronDescription],
  execute: ({ description }) =>
    Effect.gen(function* () {
      const client = yield* ApiClient
      const conversion = yield* client.schedule.convertDescription({ payload: { description } })
      return Message.CompletedConvertCronDescription({ cron: Cron.format(conversion.cron) })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedConvertCronDescription({ failure: toFailure(error) })),
      ),
    ),
})
