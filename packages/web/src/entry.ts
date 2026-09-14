import { Runtime } from 'foldkit'

import { layer as apiClientLayer } from './apiClient'
import { init } from './main'
import { Model } from './model'
import { Message } from './message'
import { update } from './update'
import { view } from './view'

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById('root'),
  resources: apiClientLayer,
  devTools: {
    Message,
  },
})

Runtime.run(application)
