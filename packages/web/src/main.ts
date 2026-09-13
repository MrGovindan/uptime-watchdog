import { Schema } from 'effect'
import { Runtime, type Update } from 'foldkit'
import { type Document, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'

// MODEL

export const Model = Schema.Struct({})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({})
export type Message = typeof Message.Type

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {},
})

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {})

// VIEW

const APP_NAME = 'Uptime Watchdog'

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: APP_NAME,
  body: h.main(
    [h.Class('grid min-h-screen place-items-center p-8')],
    [h.h1([h.Class('text-2xl font-bold')], [APP_NAME])],
  ),
})
