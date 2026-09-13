import { Api } from '@uptime-watchdog/common'
import { Effect, Layer } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { MonitorRepository } from './MonitorRepository'

export const MonitorGroupLive = HttpApiBuilder.group(Api, 'monitor', (handlers) =>
  Effect.gen(function* () {
    const repository = yield* MonitorRepository

    return handlers
      .handle('register', ({ payload }) => repository.register(payload))
      .handle('list', () => repository.list)
  }),
)

export const layer = HttpApiBuilder.layer(Api).pipe(Layer.provide(MonitorGroupLive))
