import { Button, Input, Select } from '@foldkit/ui'
import { Array } from 'effect'
import { FieldValidation } from 'foldkit'
import type { Field } from 'foldkit/fieldValidation'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

import { Message } from '../message'

export const LABEL_CLASS = 'block text-sm font-medium text-gray-700'
export const INPUT_CLASS =
  'w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
export const SELECT_CLASS =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
export const ERROR_CLASS = 'text-sm text-red-600'
export const HELPER_CLASS = 'text-sm text-gray-500'
export const BUTTON_CLASS =
  'rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500'
export const PRIMARY_BUTTON_CLASS = `${BUTTON_CLASS} bg-blue-600 text-white hover:bg-blue-700`
export const SECONDARY_BUTTON_CLASS = `${BUTTON_CLASS} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`
export const DANGER_BUTTON_CLASS = `${BUTTON_CLASS} border border-red-300 bg-white text-red-700 hover:bg-red-50`
export const CLOSE_BUTTON_CLASS = 'rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
export const DIALOG_CLASS = 'fixed inset-0 z-50 grid place-items-center p-4'
export const BACKDROP_CLASS = 'fixed inset-0 bg-black/40'
export const PANEL_CLASS = 'relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl'

const inputClass = (isInvalid: boolean): string =>
  isInvalid ? `${INPUT_CLASS} border-red-500` : `${INPUT_CLASS} border-gray-300`

const fieldError = (
  field: Field<string>,
  descriptionAttributes: ReadonlyArray<Attribute<Message>>,
  h: HtmlBuilder<Message>,
): Html =>
  FieldValidation.match(field, {
    onNotValidated: () => h.empty,
    onValidating: () => h.empty,
    onValid: () => h.empty,
    onInvalid: ({ errors }) =>
      h.span([...descriptionAttributes, h.Class(ERROR_CLASS)], [Array.headNonEmpty(errors)]),
  })

export const fieldInput = (
  id: string,
  labelText: string,
  field: Field<string>,
  onInput: (value: string) => Message,
  type: string,
  h: HtmlBuilder<Message>,
  options?: Readonly<{
    description?: string
    error?: string
    counter?: Readonly<{ text: string; isInvalid: boolean }>
    labelExtra?: Html
  }>,
): Html => {
  const description = options?.description
  const error = options?.error
  const counter = options?.counter
  const labelExtra = options?.labelExtra
  const isInvalid = field._tag === 'Invalid' || error !== undefined

  return Input.view(
    {
      id,
      value: field.value,
      onInput,
      isInvalid,
      hasDescription: isInvalid || description !== undefined,
      type,
      toView: (attributes) =>
        h.div(
          [h.Class('space-y-1')],
          [
            h.div(
              [h.Class('flex items-center justify-between')],
              [
                h.label([...attributes.label, h.Class(LABEL_CLASS)], [labelText]),
                h.span(
                  [h.Class('flex items-center gap-3')],
                  [
                    ...(counter === undefined
                      ? []
                      : [
                          h.span(
                            [h.Class(counter.isInvalid ? ERROR_CLASS : HELPER_CLASS)],
                            [counter.text],
                          ),
                        ]),
                    ...(labelExtra === undefined ? [] : [labelExtra]),
                  ],
                ),
              ],
            ),
            h.input([...attributes.input, h.Class(inputClass(isInvalid))]),
            error === undefined
              ? fieldError(field, attributes.description, h)
              : h.span([...attributes.description, h.Class(ERROR_CLASS)], [error]),
            ...(description === undefined || isInvalid
              ? []
              : [h.p([...attributes.description, h.Class(HELPER_CLASS)], [description])]),
          ],
        ),
    },
    h,
  )
}

export const plainInput = (
  id: string,
  labelText: string,
  value: string,
  onInput: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Input.view(
    {
      id,
      value,
      onInput,
      toView: (attributes) =>
        h.div(
          [h.Class('space-y-1')],
          [
            h.label([...attributes.label, h.Class(LABEL_CLASS)], [labelText]),
            h.input([...attributes.input, h.Class(`${INPUT_CLASS} border-gray-300`)]),
          ],
        ),
    },
    h,
  )

export const selectInput = (
  id: string,
  labelText: string,
  value: string,
  options: ReadonlyArray<string>,
  onChange: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Select.view(
    {
      id,
      value,
      onChange,
      toView: (attributes) =>
        h.div(
          [h.Class('space-y-1')],
          [
            h.label([...attributes.label, h.Class(LABEL_CLASS)], [labelText]),
            h.select(
              [...attributes.select, h.Class(SELECT_CLASS)],
              Array.map(options, (option) => h.option([h.Value(option)], [option])),
            ),
          ],
        ),
    },
    h,
  )

export const secondaryButton = (onClick: Message, label: string, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick,
      toView: (attributes) =>
        h.button([...attributes.button, h.Class(SECONDARY_BUTTON_CLASS)], [label]),
    },
    h,
  )

export const primaryButton = (
  inputs: Readonly<{ onClick?: Message; type?: 'submit'; label: string }>,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      ...(inputs.onClick === undefined ? {} : { onClick: inputs.onClick }),
      ...(inputs.type === undefined ? {} : { type: inputs.type }),
      toView: (attributes) =>
        h.button([...attributes.button, h.Class(PRIMARY_BUTTON_CLASS)], [inputs.label]),
    },
    h,
  )

export const dangerButton = (onClick: Message, label: string, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick,
      toView: (attributes) =>
        h.button([...attributes.button, h.Class(DANGER_BUTTON_CLASS)], [label]),
    },
    h,
  )
