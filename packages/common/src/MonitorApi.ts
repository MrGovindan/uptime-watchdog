import { Schema } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/unstable/httpapi'
import { Monitor } from './Monitor'

export const Api = HttpApi.make('UptimeWatchdog').add(
  HttpApiGroup.make('monitor').add(
    HttpApiEndpoint.post('register', '/monitor', {
      payload: Monitor.jsonCreate,
      success: Monitor.json.pipe(HttpApiSchema.status(201)),
    }),
    HttpApiEndpoint.get('list', '/monitor', {
      success: Schema.Array(Monitor.json),
    }),
  ),
)
