import { Command, expectOutMessage, given, message, model, story } from 'foldkit/story'
import { expect, test } from 'vitest'

import { ConvertCronDescription } from './command'
import * as CronHelp from './index'

const openModel = CronHelp.open(CronHelp.init().model).model

const enteringModel = CronHelp.update(
  openModel,
  CronHelp.Message.UpdatedDescription({ value: 'every weekday at 9am' }),
).model

const workingModel = CronHelp.update(enteringModel, CronHelp.Message.ClickedConvert()).model

const resultModel = CronHelp.update(
  workingModel,
  CronHelp.Message.CompletedConvertCronDescription({ cron: '0 9 * * 1-5' }),
).model

const failedModel = CronHelp.update(
  workingModel,
  CronHelp.Message.FailedConvertCronDescription({
    failure: CronHelp.ConversionFailure.Unavailable(),
  }),
).model

test('opening the dialog returns to the entering state', () => {
  const { model } = CronHelp.open(CronHelp.init().model)

  expect(model.state._tag).toBe('Entering')
  if (model.state._tag === 'Entering') {
    expect(model.state.description).toBe('')
  }
})

test('an empty description converts nothing', () => {
  story(
    CronHelp.update,
    given(openModel),
    message(CronHelp.Message.ClickedConvert()),
    Command.expectNone(),
    model((current) => {
      expect(current.state._tag).toBe('Entering')
    }),
  )
})

test('a description dispatches a conversion and starts working', () => {
  story(
    CronHelp.update,
    given(enteringModel),
    message(CronHelp.Message.ClickedConvert()),
    Command.expectHas(ConvertCronDescription),
    model((current) => {
      expect(current.state._tag).toBe('Working')
      if (current.state._tag === 'Working') {
        expect(current.state.description).toBe('every weekday at 9am')
        expect(current.state.verb.length).toBeGreaterThan(0)
      }
    }),
    Command.resolve(
      ConvertCronDescription,
      CronHelp.Message.CompletedConvertCronDescription({ cron: '0 9 * * 1-5' }),
    ),
    model((current) => {
      expect(current.state._tag).toBe('Result')
    }),
  )
})

test('a successful conversion is accepted through the out message', () => {
  story(
    CronHelp.update,
    given(resultModel),
    message(CronHelp.Message.ClickedAccept()),
    expectOutMessage(CronHelp.OutMessage.AcceptedCron({ cron: '0 9 * * 1-5' })),
  )
})

test('an unavailable provider offers a retry', () => {
  story(
    CronHelp.update,
    given(failedModel),
    message(CronHelp.Message.ClickedRetry()),
    Command.expectHas(ConvertCronDescription),
    model((current) => {
      expect(current.state._tag).toBe('Working')
    }),
    Command.resolve(
      ConvertCronDescription,
      CronHelp.Message.CompletedConvertCronDescription({ cron: '0 9 * * 1-5' }),
    ),
    model((current) => {
      expect(current.state._tag).toBe('Result')
    }),
  )
})

test('an unconvertible description does not offer a retry', () => {
  story(
    CronHelp.update,
    given(
      CronHelp.update(
        workingModel,
        CronHelp.Message.FailedConvertCronDescription({
          failure: CronHelp.ConversionFailure.NotConvertible(),
        }),
      ).model,
    ),
    message(CronHelp.Message.ClickedRetry()),
    Command.expectNone(),
    model((current) => {
      expect(current.state._tag).toBe('Failed')
    }),
  )
})

test('editing the description from a failed state returns to entering', () => {
  story(
    CronHelp.update,
    given(failedModel),
    message(CronHelp.Message.UpdatedDescription({ value: 'every blue moon' })),
    model((current) => {
      expect(current.state._tag).toBe('Entering')
      if (current.state._tag === 'Entering') {
        expect(current.state.description).toBe('every blue moon')
      }
    }),
  )
})

test('a tick replaces the current thinking verb', () => {
  story(
    CronHelp.update,
    given(workingModel),
    model((current) => {
      if (current.state._tag === 'Working' && workingModel.state._tag === 'Working') {
        expect(current.state.verb).toBe(workingModel.state.verb)
      }
    }),
    message(CronHelp.Message.TickVerb()),
    model((current) => {
      expect(current.state._tag).toBe('Working')
      if (current.state._tag === 'Working') {
        expect(typeof current.state.verb).toBe('string')
      }
    }),
  )
})

test('a late conversion result is discarded', () => {
  story(
    CronHelp.update,
    given(openModel),
    message(CronHelp.Message.CompletedConvertCronDescription({ cron: '0 9 * * 1-5' })),
    model((current) => {
      expect(current.state._tag).toBe('Entering')
    }),
  )
})
