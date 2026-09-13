import { Cron } from 'effect'
import { expect, given, role, scene, submit, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { modelWithEmptyList, modelWithMonitors, modelWithOpenDialog, monitor } from './fixtures'
import { update, view } from './main'

describe('view', () => {
  test('shows the empty state when there are no monitors', () => {
    scene(
      { update, view },
      given(modelWithEmptyList),
      expect(text('No monitors yet. Add one to get started.')).toExist(),
    )
  })

  test('renders each monitor with its URL and schedule', () => {
    scene(
      { update, view },
      given(modelWithMonitors),
      expect(text('https://example.com:443')).toExist(),
      expect(text(Cron.format(monitor.cronSchedule))).toExist(),
    )
  })

  test('submitting an empty form reveals validation errors and dispatches no command', () => {
    scene(
      { update, view },
      given(modelWithOpenDialog),
      submit(role('form')),
      expect(text('Hostname is required')).toExist(),
      expect(text('Cron schedule is required')).toExist(),
    )
  })
})
