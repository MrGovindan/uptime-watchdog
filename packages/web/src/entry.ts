import { Runtime } from 'foldkit'

import { layer as apiClientLayer } from './apiClient'
import { Model, init, update, view } from './main'
import { Message } from './message'

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
