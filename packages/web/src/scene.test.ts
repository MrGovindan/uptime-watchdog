import { expect, given, scene, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { Model, update, view } from './main'

describe('view', () => {
  test('renders the app heading', () => {
    scene({ update, view }, given(Model.make({})), expect(text('Uptime Watchdog')).toExist())
  })
})
