import { Dialog } from '@foldkit/ui'
import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

export const ConversionFailure = defineTaggedUnion({
  NotConvertible: {},
  Unavailable: {},
  TokensExhausted: {},
  Unexpected: {},
})
export type ConversionFailure = typeof ConversionFailure.Type

export const State = defineTaggedUnion({
  Entering: { description: Schema.String },
  Working: { description: Schema.String, verb: Schema.String },
  Result: { cron: Schema.String },
  Failed: { description: Schema.String, failure: ConversionFailure },
})
export type State = typeof State.Type

export const Model = Schema.Struct({
  dialog: Dialog.Model,
  state: State,
})
export type Model = typeof Model.Type
