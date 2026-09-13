import { Toast as UiToast } from '@foldkit/ui'
import { Schema } from 'effect'

export const ToastPayload = Schema.Struct({
  message: Schema.String,
})

export const Toast = UiToast.make(ToastPayload)
