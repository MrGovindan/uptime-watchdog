import { Context, Effect, Option } from 'effect'
import { MountTracker } from 'foldkit/mount'
import { expect, test } from 'vitest'

// These tests exercise the real vdom patch path that the foldkit runtime uses,
// so they can assert on DOM node identity and focus preservation across view
// changes — things the VNode-level scene/story tests cannot observe.
import {
  __htmlBuilder,
  __setRuntime,
  __clearRuntime,
} from '../../node_modules/foldkit/dist/html/index.js'
import { Dispatch as DispatchService } from '../../node_modules/foldkit/dist/runtime/dispatch.js'
import { __patchVNode } from '../../node_modules/foldkit/dist/vdom.js'
import type { VNode } from '../../node_modules/foldkit/dist/snabbdom/vnode.js'

import * as CronHelp from './index'

const h = __htmlBuilder() as unknown as Parameters<typeof CronHelp.view>[1]

const entering = CronHelp.update(
  CronHelp.open(CronHelp.init().model).model,
  CronHelp.Message.UpdatedDescription({ value: 'every blue moon' }),
).model
const working = CronHelp.update(entering, CronHelp.Message.ClickedConvert()).model
const failedWith = (failure: CronHelp.ConversionFailure) =>
  CronHelp.update(working, CronHelp.Message.FailedConvertCronDescription({ failure })).model

const dispatchSync = () => {
  /* no-op: rendering never dispatches */
}

const withRuntime = <T>(render: () => T): T => {
  const runtimeContext = Context.make(DispatchService, {
    dispatchAsync: () => Effect.void,
    dispatchSync,
  }).pipe(
    Context.add(MountTracker, {
      started: () => {
        /* noop */
      },
      ended: () => {
        /* noop */
      },
    }),
  )
  __setRuntime(dispatchSync, runtimeContext)
  try {
    return render()
  } finally {
    __clearRuntime()
  }
}

const renderRoot = (model: CronHelp.Model): VNode =>
  withRuntime(() => h.div([], [CronHelp.view(model, h)])) as never

const patchStep = (
  container: HTMLElement,
  maybeCurrent: VNode | null,
  model: CronHelp.Model,
): VNode =>
  __patchVNode(
    maybeCurrent === null ? Option.none() : Option.some(maybeCurrent),
    renderRoot(model),
    container,
    new Set(),
    () => {
      /* noop */
    },
  )

const readInput = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector('input')
  if (input === null) throw new Error('the dialog no longer contains an input field')
  return input as HTMLInputElement
}

test.each([
  { name: 'unconvertible description', failure: CronHelp.ConversionFailure.NotConvertible() },
  { name: 'unavailable provider', failure: CronHelp.ConversionFailure.Unavailable() },
  { name: 'exhausted tokens', failure: CronHelp.ConversionFailure.TokensExhausted() },
  { name: 'unexpected error', failure: CronHelp.ConversionFailure.Unexpected() },
])('rephrasing after an $name keeps the input focused', ({ failure }) => {
  const container = document.createElement('div')

  const current = patchStep(container, null, failedWith(failure))
  document.body.append(container)

  const input = readInput(container)
  input.focus()
  expect(document.activeElement).toBe(input)

  const next = CronHelp.update(
    failedWith(failure),
    CronHelp.Message.UpdatedDescription({ value: 'every weekday at 9am' }),
  ).model
  patchStep(container, current, next)

  expect(readInput(container)).toBe(input)
  expect(document.activeElement).toBe(input)

  container.remove()
})
