import { Runtime } from 'foldkit'

import { ApiClient } from './apiClient'
import { ListMonitors } from './command'
import { Message } from './message'
import { makeInitialModel, type Model } from './model'

// INIT

export const init: Runtime.ApplicationInit<Model, Message, void, ApiClient> = () => ({
  model: makeInitialModel(),
  commands: [ListMonitors()],
})
