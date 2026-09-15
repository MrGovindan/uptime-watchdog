import {
  type CronDescription,
  CronExpression,
  DescriptionNotConvertible,
  ProviderUnavailable,
  type ScheduleConversion,
  TokensExhausted,
} from '@uptime-watchdog/common'
import { Cause, Context, Effect, Layer, Schema } from 'effect'
import { AiError, LanguageModel, Prompt } from 'effect/unstable/ai'

const SYSTEM_PROMPT =
  'You convert natural language schedule descriptions into cron expressions. ' +
  'Respond through the schema for the cron field only: a 5-field standard cron ' +
  'expression (minute hour day-of-month month day-of-week) formatted exactly as ' +
  'the description implies, or null when the description cannot be expressed as ' +
  'a recurring schedule.'

const CronResponse = Schema.Struct({
  cron: Schema.NullOr(CronExpression),
})

type ConversionError = AiError.AiError | Cause.TimeoutError | DescriptionNotConvertible

const convertWithModel = (description: CronDescription) =>
  LanguageModel.generateObject({
    prompt: [
      Prompt.systemMessage({ content: SYSTEM_PROMPT }),
      Prompt.userMessage({ content: [Prompt.makePart('text', { text: description })] }),
    ],
    objectName: 'cron_converted',
    schema: CronResponse,
  }).pipe(
    Effect.map(({ value }) => value),
    Effect.tapError(Effect.log),
    Effect.flatMap((value: { readonly cron: (typeof CronResponse.Type)['cron'] }) =>
      value.cron === null
        ? Effect.fail(
            new DescriptionNotConvertible({
              description,
              message: 'The model concluded the description is not schedulable',
            }),
          )
        : Effect.succeed({ cron: value.cron } satisfies ScheduleConversion),
    ),
  )

const fromAiError = (
  error: ConversionError,
  description: CronDescription,
): ProviderUnavailable | TokensExhausted | DescriptionNotConvertible => {
  if (error instanceof DescriptionNotConvertible) {
    return error
  }
  if (error._tag === 'TimeoutError') {
    return new ProviderUnavailable({ message: 'The schedule provider timed out' })
  }
  if (!AiError.isAiError(error)) {
    return new ProviderUnavailable({ message: String(error) })
  }

  if (error.cause._tag === 'RateLimitError' || error.cause._tag === 'QuotaExhaustedError') {
    return new TokensExhausted()
  }
  if (error.cause._tag === 'InvalidOutputError' || error.cause._tag === 'StructuredOutputError') {
    return new DescriptionNotConvertible({ description, message: error.message })
  }
  return new ProviderUnavailable({ message: error.message })
}

export interface Interface {
  readonly convert: (
    description: CronDescription,
  ) => Effect.Effect<
    ScheduleConversion,
    ProviderUnavailable | TokensExhausted | DescriptionNotConvertible
  >
}

export class CronConversion extends Context.Service<CronConversion, Interface>()(
  'CronConversion',
) {}

export const make = Effect.gen(function* () {
  const languageModel = yield* LanguageModel.LanguageModel

  return {
    convert: (description: CronDescription) =>
      convertWithModel(description).pipe(
        Effect.mapError((error: ConversionError) => fromAiError(error, description)),
        Effect.provideService(LanguageModel.LanguageModel, languageModel),
      ),
  } satisfies Interface
})

export const layer = Layer.effect(CronConversion, make)
