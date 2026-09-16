import { Duration, Effect, Schema, Stream } from 'effect'
import { make } from 'foldkit/subscription'

import { Message } from './message'
import type { Model } from './model'

const THINKING_INTERVAL_MS = 2000

export const subscriptions = make<Model, Message>()((entry) => ({
  think: entry(
    { isWorking: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        isWorking: model.state._tag === 'Working',
      }),
      dependenciesToStream: ({ isWorking }) =>
        Stream.when(
          Stream.map(Stream.tick(Duration.millis(THINKING_INTERVAL_MS)), () => Message.TickVerb()),
          Effect.sync(() => isWorking),
        ),
    },
  ),
}))
