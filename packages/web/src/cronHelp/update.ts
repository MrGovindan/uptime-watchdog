import { CronDescription } from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { Update } from 'foldkit'
import { evo } from 'foldkit/struct'

import { ApiClient } from '../apiClient'
import { ConvertCronDescription } from './command'
import { Message, OutMessage } from './message'
import { State, type Model } from './model'
import { randomThinkingVerb } from './thinking'

export type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClient>
export type InitReturn = Update.Return<Model, Message>

const readDialog = (model: Model) => Option.some(model.dialog)
const writeDialog = (model: Model, nextDialog: Dialog.Model): Model =>
  evo(model, { dialog: () => nextDialog })
const toDialogMessage = (message: Dialog.Message): Message => Message.GotDialogMessage({ message })

const foldDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model: resetToEntering(model) }),
})

export const resetToEntering = (model: Model): Model =>
  evo(model, { state: () => State.Entering({ description: '' }) })

const foldDialog = Update.foldChild({
  update: Dialog.update,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toDialogMessage,
  foldOutMessage: foldDialogOutMessage,
})

const foldDialogOpen = Update.foldChildStep({
  update: Dialog.open,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toDialogMessage,
  foldOutMessage: foldDialogOutMessage,
})

export const init = (): InitReturn => ({
  model: {
    dialog: Dialog.init({ id: 'cron-help-dialog' }),
    state: State.Entering({ description: '' }),
  },
})

const isConvertibleDescription = (description: string): boolean =>
  Option.isSome(Schema.decodeOption(CronDescription)(description))

const startWorking = (model: Model, description: string): UpdateReturn => ({
  model: evo(model, {
    state: () => State.Working({ description, verb: randomThinkingVerb() }),
  }),
  commands: [ConvertCronDescription({ description })],
})

export const open = (model: Model): UpdateReturn => {
  const { model: opened } = foldDialogOpen(model)
  return { model: resetToEntering(opened) }
}

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    GotDialogMessage: ({ message: dialogMessage }) => foldDialog(model, dialogMessage),

    UpdatedDescription: ({ value }) => ({
      model: evo(model, { state: () => State.Entering({ description: value }) }),
    }),

    ClickedConvert: () => {
      if (model.state._tag !== 'Entering') {
        return { model }
      }

      const description = model.state.description.trim()
      if (!isConvertibleDescription(description)) {
        return { model }
      }

      return startWorking(model, description)
    },

    TickVerb: () => {
      if (model.state._tag !== 'Working') {
        return { model }
      }

      const { description } = model.state

      return {
        model: evo(model, {
          state: () => State.Working({ description, verb: randomThinkingVerb() }),
        }),
      }
    },

    CompletedConvertCronDescription: ({ cron }) =>
      model.state._tag === 'Working'
        ? { model: evo(model, { state: () => State.Result({ cron }) }) }
        : { model },

    FailedConvertCronDescription: ({ failure }) => {
      if (model.state._tag !== 'Working') {
        return { model }
      }

      const { description } = model.state

      return {
        model: evo(model, {
          state: () => State.Failed({ description, failure }),
        }),
      }
    },

    ClickedRetry: () => {
      if (model.state._tag !== 'Failed') {
        return { model }
      }

      const description = model.state.description
      if (model.state.failure._tag !== 'Unavailable' || !isConvertibleDescription(description)) {
        return { model }
      }

      return startWorking(model, description)
    },

    ClickedAccept: () =>
      model.state._tag === 'Result'
        ? { model, outMessage: OutMessage.AcceptedCron({ cron: model.state.cron }) }
        : { model },
  })
