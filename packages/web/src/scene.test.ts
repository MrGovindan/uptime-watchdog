import { NotValidated } from 'foldkit/fieldValidation'
import { expect, given, role, scene, submit, text } from 'foldkit/scene'
import { Option } from 'effect'
import { evo } from 'foldkit/struct'
import { describe, test } from 'vitest'

import {
  modelReadyToCreate,
  modelReadyToEdit,
  modelWithEmptyList,
  modelWithMonitors,
  modelWithOpenDialog,
  monitor,
} from './fixtures'
import { Dialog } from '@foldkit/ui'
import { makeInitialModel, update, view } from './main'

describe('view', () => {
  test('shows the empty state when there are no monitors', () => {
    scene(
      { update, view },
      given(modelWithEmptyList),
      expect(text('No monitors yet. Add one to get started.')).toExist(),
    )
  })

  test('renders each monitor with its name and URL and a friendly schedule description', () => {
    scene(
      { update, view },
      given(modelWithMonitors),
      expect(text('Prod API')).toExist(),
      expect(text('https://example.com:443')).toExist(),
      expect(text('Every 5 minutes')).toExist(),
    )
  })

  test('shows a friendly description of the entered cron schedule', () => {
    scene({ update, view }, given(modelReadyToCreate), expect(text('Every 5 minutes')).toExist())
  })

  test('counts the name characters after trimming', () => {
    const model = evo(modelWithOpenDialog, {
      form: (form) => evo(form, { name: () => NotValidated({ value: '  Prod API  ' }) }),
    })

    scene({ update, view }, given(model), expect(text('8/128')).toExist())
  })

  test('shows the over-limit count for a too-long name', () => {
    const model = evo(modelWithOpenDialog, {
      form: (form) => evo(form, { name: () => NotValidated({ value: 'x'.repeat(129) }) }),
    })

    scene({ update, view }, given(model), expect(text('129/128')).toExist())
  })

  test('shows an error when the entered cron schedule is not valid', () => {
    const model = evo(modelWithOpenDialog, {
      form: (form) => evo(form, { cronSchedule: () => NotValidated({ value: 'not a cron' }) }),
    })

    scene({ update, view }, given(model), expect(text('Enter a valid cron expression')).toExist())
  })

  test('submitting an empty form reveals validation errors and dispatches no command', () => {
    scene(
      { update, view },
      given(modelWithOpenDialog),
      submit(role('form')),
      expect(text('Name is required')).toExist(),
      expect(text('Hostname is required')).toExist(),
      expect(text('Enter a valid cron expression')).toExist(),
    )
  })

  test('offers edit and delete actions for each monitor', () => {
    scene(
      { update, view },
      given(modelWithMonitors),
      expect(text('Edit')).toExist(),
      expect(text('Delete')).toExist(),
    )
  })

  test('titles the dialog and submit button for editing', () => {
    scene(
      { update, view },
      given(modelReadyToEdit),
      expect(text('Edit monitor')).toExist(),
      expect(text('Save changes')).toExist(),
    )
  })

  test('the delete confirmation dialog names the monitor', () => {
    const confirming = evo(makeInitialModel(), {
      maybeDeleteMonitor: () => Option.some(monitor),
      deleteDialog: () => Dialog.init({ id: 'delete-monitor-dialog', isOpen: true }),
    })

    scene(
      { update, view },
      given(confirming),
      expect(text('Delete monitor')).toExist(),
      expect(text('Delete Prod API? Its notification targets will also be removed.')).toExist(),
    )
  })
})
