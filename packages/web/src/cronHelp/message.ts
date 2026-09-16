import { Dialog } from '@foldkit/ui'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ConversionFailure } from './model'

export const Message = defineMessageUnion({
  GotDialogMessage: { message: Dialog.Message },
  UpdatedDescription: { value: Schema.String },
  ClickedConvert: {},
  TickVerb: {},
  CompletedConvertCronDescription: { cron: Schema.String },
  FailedConvertCronDescription: { failure: ConversionFailure },
  ClickedRetry: {},
  ClickedAccept: {},
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  AcceptedCron: { cron: Schema.String },
})
export type OutMessage = typeof OutMessage.Type
