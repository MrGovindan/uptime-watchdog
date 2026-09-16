import type { Subscriptions } from 'foldkit/subscription'
import { Runtime } from 'foldkit'
import { aggregate, lift } from 'foldkit/subscription'

import { ApiClient } from './apiClient'
import { ListMonitors } from './command'
import * as CronHelp from './cronHelp'
import { Message } from './message'
import { makeInitialModel, type Model } from './model'

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

export const subscriptions: Subscriptions<Model, Message, ApiClient> = aggregate<Model, Message>()(
  cronHelpSubscriptions,
)
