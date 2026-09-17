import { Runtime } from 'foldkit'

import { init, subscriptions } from './main'
import { Model } from './model'
import { Message } from './message'
import { Resources } from './resources'
import { update } from './update'
import { view } from './view'

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById('root'),
  resources: Resources,
  subscriptions,
  devTools: {
    Message,
  },
})

Runtime.run(application)
