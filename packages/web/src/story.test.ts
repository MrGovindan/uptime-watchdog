import { Animation, Dialog, Toast as UiToast } from '@foldkit/ui'
import { Option } from 'effect'
import { Valid } from 'foldkit/fieldValidation'
import { Command, given, message, model, story } from 'foldkit/story'
import { evo } from 'foldkit/struct'
import { expect, test } from 'vitest'

import { DeleteMonitor, ListMonitors, RegisterMonitor, UpdateMonitor } from './command'
import { makeInitialModel, MonitorsAsyncData, type Model } from './model'
import { update } from './update'
import { Message } from './message'
import {
  modelReadyToCreate,
  modelReadyToEdit,
  modelWithEmptyList,
  modelWithHealthyMonitor,
  modelWithMonitors,
  modelWithOpenDialog,
  monitor,
  monitorDegradedEvent,
  monitorDeletedEvent,
  monitorHealthyEvent,
  monitorRegisteredEvent,
  monitorUpdatedEvent,
  notificationTargetAddedEvent,
  pendingMonitor,
  updatedMonitor,
} from './fixtures'

const completedWaitBeforeDismissal = UiToast.Message.CompletedWaitBeforeDismissal({
  entryId: 'missing',
  version: 0,
})

test('completed list replaces the loading state', () => {
  story(
    update,
    given(makeInitialModel()),
    message(Message.CompletedListMonitors({ monitors: [pendingMonitor] })),
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
        expect(current.monitors.data[0]?.monitor.id).toBe(monitor.id)
      }
    }),
  )
})

test('clicking edit opens the dialog prefilled with the monitor', () => {
  story(
    update,
    given(modelWithMonitors),
    message(Message.ClickedOpenEditMonitor({ monitor })),
    Command.expectHas(Dialog.ShowDialog),
    Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
    model((current) => {
      expect(Option.isSome(current.editingMonitorId)).toBe(true)
      expect(current.form.name.value).toBe('Prod API')
      expect(current.form.hostname.value).toBe('example.com')
      expect(current.form.port.value).toBe('443')
      expect(current.form.cronSchedule.value).toBe('0-55/5 * * * *')
      expect(current.dialog.isOpen).toBe(true)
    }),
  )
})

test('submitting the edit form dispatches an update and replaces the monitor', () => {
  story(
    update,
    given(modelReadyToEdit),
    message(Message.ClickedUpdateMonitor()),
    Command.expectExact(UpdateMonitor, Dialog.CloseDialog),
    Command.resolveAll(
      [UpdateMonitor, Message.CompletedUpdateMonitor({ monitor: updatedMonitor })],
      [Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()],
      [UiToast.WaitBeforeDismissal, completedWaitBeforeDismissal],
      [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint()],
      [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation()],
    ),
    Command.expectNone(),
    model((current) => {
      expect(current.monitors._tag).toBe('Success')
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data[0]?.monitor.name).toBe('Renamed API')
        expect(current.monitors.data[0]?.monitor.id).toBe(monitor.id)
      }
      expect(current.toast.entries[0]?.variant).toBe('Success')
    }),
  )
})

test('requesting delete opens a confirmation dialog naming the monitor', () => {
  story(
    update,
    given(modelWithMonitors),
    message(Message.ClickedRequestDeleteMonitor({ monitor })),
    Command.expectHas(Dialog.ShowDialog),
    Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
    model((current) => {
      expect(Option.isSome(current.maybeDeleteMonitor)).toBe(true)
      expect(current.deleteDialog.isOpen).toBe(true)
    }),
  )
})

test('confirming delete dispatches the delete and removes the monitor', () => {
  const confirming = evo(modelWithMonitors, {
    maybeDeleteMonitor: () => Option.some(monitor),
    deleteDialog: () => Dialog.init({ id: 'delete-monitor-dialog', isOpen: true }),
  })

  story(
    update,
    given(confirming),
    message(Message.ClickedConfirmDeleteMonitor()),
    Command.expectExact(DeleteMonitor, Dialog.CloseDialog),
    Command.resolveAll(
      [DeleteMonitor, Message.CompletedDeleteMonitor({ monitorId: monitor.id })],
      [Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()],
      [UiToast.WaitBeforeDismissal, completedWaitBeforeDismissal],
      [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint()],
      [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation()],
    ),
    Command.expectNone(),
    model((current) => {
      expect(current.monitors._tag).toBe('Success')
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data).toHaveLength(0)
      }
      expect(current.toast.entries[0]?.variant).toBe('Success')
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
        expect(current.monitors.data[0]?.monitor.id).toBe(monitor.id)
      }
    }),
  )
})

test('a registered event seeds a loading list', () => {
  const loadingModel = evo(makeInitialModel(), {
    monitors: () => MonitorsAsyncData.Loading(),
  })

  story(
    update,
    given(loadingModel),
    message(Message.GotWatchdogEvent({ event: monitorRegisteredEvent })),
    model((current) => {
      expect(current.monitors._tag).toBe('Success')
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data[0]?.monitor.id).toBe(monitor.id)
      }
    }),
  )
})

test('a registered event seeds a failed list', () => {
  const failedModel = evo(makeInitialModel(), {
    monitors: () => MonitorsAsyncData.Failure({ error: 'network down' }),
  })

  story(
    update,
    given(failedModel),
    message(Message.GotWatchdogEvent({ event: monitorRegisteredEvent })),
    model((current) => {
      expect(current.monitors._tag).toBe('Success')
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data[0]?.monitor.id).toBe(monitor.id)
      }
    }),
  )
})

test('a registered event does not duplicate a monitor already in the list', () => {
  story(
    update,
    given(modelWithMonitors),
    message(Message.GotWatchdogEvent({ event: monitorRegisteredEvent })),
    model((current) => {
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data).toHaveLength(1)
        expect(current.monitors.data[0]?.monitor.id).toBe(monitor.id)
      }
    }),
  )
})

test('an updated event replaces the monitor it carries', () => {
  story(
    update,
    given(modelWithMonitors),
    message(Message.GotWatchdogEvent({ event: monitorUpdatedEvent })),
    model((current) => {
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data[0]?.monitor.name).toBe(updatedMonitor.name)
      }
    }),
  )
})

test('an updated event does not seed a loading list', () => {
  const loadingModel = evo(makeInitialModel(), {
    monitors: () => MonitorsAsyncData.Loading(),
  })

  story(
    update,
    given(loadingModel),
    message(Message.GotWatchdogEvent({ event: monitorUpdatedEvent })),
    model((current) => {
      expect(current.monitors._tag).toBe('Loading')
    }),
  )
})

test('health events set the health they carry', () => {
  for (const [event, tag] of [
    [monitorHealthyEvent, 'Healthy'],
    [monitorDegradedEvent, 'Degraded'],
  ] as const) {
    story(
      update,
      given(modelWithMonitors),
      message(Message.GotWatchdogEvent({ event })),
      model((current) => {
        if (current.monitors._tag === 'Success') {
          expect(current.monitors.data).toHaveLength(1)
          expect(current.monitors.data[0]?.monitor.name).toBe(updatedMonitor.name)
          expect(current.monitors.data[0]?.health._tag).toBe('Some')
          const health = current.monitors.data[0]?.health
          if (health?._tag === 'Some') {
            expect(health.value._tag).toBe(tag)
          }
        }
      }),
    )
  }
})

test('a monitor event preserves the health already on the monitor', () => {
  story(
    update,
    given(modelWithHealthyMonitor),
    message(Message.GotWatchdogEvent({ event: monitorUpdatedEvent })),
    model((current) => {
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data[0]?.monitor.name).toBe(updatedMonitor.name)
        expect(current.monitors.data[0]?.health._tag).toBe('Some')
      }
    }),
  )
})

test('a completed update preserves the health already on the monitor', () => {
  story(
    update,
    given(modelWithHealthyMonitor),
    message(Message.CompletedUpdateMonitor({ monitor: updatedMonitor })),
    Command.expectHas(UiToast.WaitBeforeDismissal, Animation.WaitForPaint),
    Command.resolveAll(
      [UiToast.WaitBeforeDismissal, completedWaitBeforeDismissal],
      [Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint()],
      [Animation.WaitForAnimationSettled, Animation.Message.EndedAnimation()],
    ),
    model((current) => {
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data[0]?.monitor.name).toBe('Renamed API')
        expect(current.monitors.data[0]?.health._tag).toBe('Some')
      }
    }),
  )
})

test('a deleted event removes the monitor', () => {
  story(
    update,
    given(modelWithMonitors),
    message(Message.GotWatchdogEvent({ event: monitorDeletedEvent })),
    model((current) => {
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data).toHaveLength(0)
      }
    }),
  )
})

test('a notification target event leaves the monitor list untouched', () => {
  story(
    update,
    given(modelWithMonitors),
    message(Message.GotWatchdogEvent({ event: notificationTargetAddedEvent })),
    model((current) => {
      if (current.monitors._tag === 'Success') {
        expect(current.monitors.data).toHaveLength(1)
        expect(current.monitors.data[0]?.monitor.id).toBe(monitor.id)
      }
    }),
  )
})
