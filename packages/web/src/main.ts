import { Effect, Schedule, Stream } from 'effect'
import type { Subscriptions } from 'foldkit/subscription'
import { Runtime } from 'foldkit'
import { aggregate, lift, make } from 'foldkit/subscription'

import { ApiClient } from './apiClient'
import { ListMonitors } from './command'
import * as CronHelp from './cronHelp'
import { Message } from './message'
import { makeInitialModel, type Model } from './model'
import type { ResourcesType } from './resources'
import { WatchdogRpcClient } from './rpcClient'

// INIT

export const init: Runtime.ApplicationInit<Model, Message, void, ApiClient> = () => ({
  model: makeInitialModel(),
  commands: [ListMonitors()],
})

// SUBSCRIPTIONS

const cronHelpSubscriptions = lift(CronHelp.subscriptions)<Model, Message>({
  toChildModel: (model) => model.cronHelp,
  toParentMessage: (message) => Message.GotCronHelpMessage({ message }),
})

// Streaming RPCs do not restart on their own once the socket drops, so the
// subscription re-issues the events request on a backoff schedule.
const retryPolicy = Schedule.min([Schedule.exponential(500, 1.5), Schedule.spaced(5000)])

const watchdogEventSubscriptions = make<Model, Message, ResourcesType>()((entry) => ({
  events: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Effect.gen(function* () {
          const client = yield* WatchdogRpcClient
          return client.events().pipe(
            Stream.map((event) => Message.GotWatchdogEvent({ event })),
            Stream.retry(retryPolicy),
            Stream.catchCause(() => Stream.empty),
          )
        }).pipe(Stream.unwrap),
    },
  ),
}))

export const subscriptions: Subscriptions<Model, Message, ResourcesType> = aggregate<
  Model,
  Message,
  ResourcesType
>()(cronHelpSubscriptions, watchdogEventSubscriptions)
