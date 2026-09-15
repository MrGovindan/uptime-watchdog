import { Api } from '@uptime-watchdog/common'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { CronConversion } from './CronConversion'

export const ScheduleGroupLive = HttpApiBuilder.group(Api, 'schedule', (handlers) =>
  Effect.gen(function* () {
    const conversion = yield* CronConversion

    return handlers.handle('convertDescription', ({ payload: { description } }) =>
      conversion.convert(description),
    )
  }),
)
