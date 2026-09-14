import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'

import {
  MattermostUserNotFound,
  MattermostUnavailable,
  MonitorNotFound,
  NotificationTargetAlreadyExists,
} from './MonitorApi'

describe('api errors', () => {
  it('render a human-readable message for a missing monitor', () => {
    const error = Schema.decodeSync(MonitorNotFound)({
      _tag: 'MonitorNotFound',
      monitorId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    })

    expect(error.message).toBe('Monitor 3f2504e0-4f89-41d3-9a0c-0305e82c3301 was not found')
  })

  it('render a human-readable message for a duplicate notification target', () => {
    const error = Schema.decodeSync(NotificationTargetAlreadyExists)({
      _tag: 'NotificationTargetAlreadyExists',
      monitorId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      mattermostUserId: 'mm-jesse',
    })

    expect(error.message).toBe(
      'Mattermost user mm-jesse is already a notification target for this monitor',
    )
  })

  it('render a human-readable message for a missing mattermost user', () => {
    const error = Schema.decodeSync(MattermostUserNotFound)({
      _tag: 'MattermostUserNotFound',
      mattermostUserId: 'mm-jesse',
    })

    expect(error.message).toBe('Mattermost user mm-jesse was not found')
  })

  it('render the upstream message for an unavailable mattermost', () => {
    const error = Schema.decodeSync(MattermostUnavailable)({
      _tag: 'MattermostUnavailable',
      message: 'Mattermost is down',
    })

    expect(error.message).toBe('Mattermost is down')
  })
})
