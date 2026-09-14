import { Animation, Dialog, Toast as UiToast } from '@foldkit/ui'
import { Valid } from 'foldkit/fieldValidation'
import { Command, given, message, model, story } from 'foldkit/story'
import { evo } from 'foldkit/struct'
import { expect, test } from 'vitest'

import { ListMonitors, RegisterMonitor } from './command'
import { makeInitialModel, update, MonitorsAsyncData, type Model } from './main'
import { Message } from './message'
import { modelWithEmptyList, modelWithOpenDialog, modelReadyToCreate, monitor } from './fixtures'

const completedWaitBeforeDismissal = UiToast.Message.CompletedWaitBeforeDismissal({
  entryId: 'missing',
  version: 0,
})

test('completed list replaces the loading state', () => {
  story(
    update,
    given(makeInitialModel()),
    message(Message.CompletedListMonitors({ monitors: [monitor] })),
    model((current) => {
      expect(current.monitors._tag).toBe('Success')
    }),
  )
})

test('failed list records the error', () => {
  story(
    update,
    given(makeInitialModel()),
    message(Message.FailedListMonitors({ error: 'network down' })),
    model((current) => {
      expect(current.monitors._tag).toBe('Failure')
      if (current.monitors._tag === 'Failure') {
        expect(current.monitors.error).toBe('network down')
      }
    }),
  )
})

test('retry loads the list again', () => {
  story(
    update,
    given(makeInitialModel()),
    message(Message.ClickedRetryListMonitors()),
    model((current) => {
      expect(current.monitors._tag).toBe('Loading')
    }),
    Command.expectExact(ListMonitors),
    Command.resolve(ListMonitors, Message.CompletedListMonitors({ monitors: [] })),
    model((current) => {
      expect(current.monitors._tag).toBe('Success')
    }),
  )
})

test('clicking add monitor opens the dialog', () => {
  story(
    update,
    given(makeInitialModel()),
    message(Message.ClickedOpenAddMonitor()),
    Command.expectExact(Dialog.ShowDialog),
    Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
    model((current) => {
      expect(current.dialog.isOpen).toBe(true)
    }),
  )
})

test('submitting an invalid form reveals errors and dispatches nothing', () => {
  story(
    update,
    given(modelWithOpenDialog),
    message(Message.ClickedCreateMonitor()),
    Command.expectNone(),
    model((current) => {
      expect(current.form.name._tag).toBe('Invalid')
      expect(current.form.hostname._tag).toBe('Invalid')
      expect(current.form.cronSchedule._tag).toBe('Invalid')
      expect(current.dialog.isOpen).toBe(true)
    }),
  )
})

test('submitting a valid form registers the monitor, closes, and resets', () => {
  story(
    update,
    given(modelReadyToCreate),
    message(Message.ClickedCreateMonitor()),
    model((current) => {
      expect(current.dialog.isOpen).toBe(false)
    }),
    Command.expectExact(RegisterMonitor, Dialog.CloseDialog),
    Command.resolveAll(
      [RegisterMonitor, Message.CompletedRegisterMonitor({ monitor })],
      [Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()],
      [UiToast.WaitBeforeDismissal, completedWaitBeforeDismissal],
      [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint()],
      [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation()],
    ),
    Command.expectNone(),
    model((current) => {
      expect(current.monitors._tag).toBe('Success')
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data[0]?.id).toBe(monitor.id)
      }
      expect(current.form.hostname._tag).toBe('NotValidated')
    }),
  )
})

test('a completed register inserts the monitor and shows a success toast', () => {
  story(
    update,
    given(modelWithEmptyList),
    message(Message.CompletedRegisterMonitor({ monitor })),
    Command.expectHas(UiToast.WaitBeforeDismissal, Animation.WaitForPaint),
    Command.resolveAll(
      [UiToast.WaitBeforeDismissal, completedWaitBeforeDismissal],
      [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint()],
      [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation()],
    ),
    model((current) => {
      expect(current.monitors._tag).toBe('Success')
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data).toHaveLength(1)
      }
      expect(current.toast.entries).toHaveLength(1)
      expect(current.toast.entries[0]?.variant).toBe('Success')
    }),
  )
})

test('a failed register shows an error toast', () => {
  story(
    update,
    given(modelWithEmptyList),
    message(Message.FailedRegisterMonitor({ error: 'server exploded' })),
    Command.expectHas(UiToast.WaitBeforeDismissal, Animation.WaitForPaint),
    Command.resolveAll(
      [UiToast.WaitBeforeDismissal, completedWaitBeforeDismissal],
      [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint()],
      [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation()],
    ),
    model((current) => {
      expect(current.toast.entries).toHaveLength(1)
      expect(current.toast.entries[0]?.variant).toBe('Error')
    }),
  )
})

test('adding a header appends an empty row', () => {
  story(
    update,
    given(modelWithOpenDialog),
    message(Message.ClickedAddHeader()),
    message(Message.ClickedAddHeader()),
    model((current) => {
      expect(current.form.headers).toHaveLength(2)
      expect(current.form.headerSequence).toBe(2)
    }),
  )
})

test('removing a header drops only that row', () => {
  story(
    update,
    given(modelWithOpenDialog),
    message(Message.ClickedAddHeader()),
    message(Message.ClickedAddHeader()),
    message(Message.ClickedRemoveHeader({ id: 'header-0' })),
    model((current) => {
      expect(current.form.headers).toHaveLength(1)
      expect(current.form.headers[0]?.id).toBe('header-1')
    }),
  )
})

test('duplicate header names are rejected on submit', () => {
  const withDuplicateHeaders: Model = evo(modelWithOpenDialog, {
    form: (form) => ({
      ...form,
      headers: [
        {
          id: 'header-0',
          name: Valid({ value: 'X-Trace' }),
          value: Valid({ value: 'one' }),
        },
        {
          id: 'header-1',
          name: Valid({ value: 'X-Trace' }),
          value: Valid({ value: 'two' }),
        },
      ],
    }),
  })

  story(
    update,
    given(withDuplicateHeaders),
    message(Message.ClickedCreateMonitor()),
    Command.expectNone(),
    model((current) => {
      expect(current.form.headers[1]?.name._tag).toBe('Invalid')
    }),
  )
})

test('a monitor created before the list loads still lands in the list', () => {
  const loadingModel = evo(makeInitialModel(), {
    monitors: () => MonitorsAsyncData.Loading(),
  })

  story(
    update,
    given(loadingModel),
    message(Message.CompletedRegisterMonitor({ monitor })),
    Command.resolveAll(
      [UiToast.WaitBeforeDismissal, completedWaitBeforeDismissal],
      [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint()],
      [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation()],
    ),
    model((current) => {
      expect(current.monitors._tag).toBe('Success')
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data[0]?.id).toBe(monitor.id)
      }
    }),
  )
})
