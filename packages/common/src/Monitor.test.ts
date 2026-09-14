import { describe, expect, it } from '@effect/vitest'
import { Cron, DateTime, Effect, Option, Schema } from 'effect'

import { Monitor, MonitorDefinition, MonitorId, MonitorName } from './Monitor'

const uuid = '2f1c9b3e-4a5d-4f6a-8b7c-1d2e3f4a5b6c'

const definitionJson = {
  name: 'Prod API',
  request: { hostname: 'example.test', port: 8080, protocol: 'https', method: 'GET', headers: {} },
  cronSchedule: '*/5 * * * *',
}

const decodeMonitorId = Schema.decodeUnknownEffect(MonitorId)
const decodeMonitorName = Schema.decodeUnknownEffect(MonitorName)
const decodeDefinition = Schema.decodeUnknownEffect(MonitorDefinition)
const decodeMonitor = Schema.decodeUnknownEffect(Monitor.json)
const encodeMonitor = Schema.encodeUnknownEffect(Monitor.json)
const encodeDefinition = Schema.encodeUnknownEffect(MonitorDefinition)
const encodeInsert = Schema.encodeUnknownEffect(Monitor.insert)

const makeDefinition = () => decodeDefinition(definitionJson)

const makeInsert = (definition: MonitorDefinition) =>
  Monitor.insert.make({
    id: MonitorId.make(uuid),
    name: definition.name,
    request: definition.request,
    cronSchedule: definition.cronSchedule,
  })

describe('MonitorId', () => {
  it.effect('accepts a uuid', () =>
    Effect.gen(function* () {
      const id = uuid

      expect(yield* decodeMonitorId(id)).toBe(id)
    }),
  )

  it.effect('rejects a non-uuid', () =>
    Effect.gen(function* () {
      const error = yield* decodeMonitorId('not-a-uuid').pipe(Effect.flip)

      expect(error).toBeInstanceOf(Schema.SchemaError)
    }),
  )
})

describe('MonitorName', () => {
  it.effect('trims surrounding whitespace', () =>
    Effect.gen(function* () {
      expect(yield* decodeMonitorName('  Prod API  ')).toBe('Prod API')
    }),
  )

  it.effect('measures the length limit after trimming', () =>
    Effect.gen(function* () {
      const atLimit = ` ${'x'.repeat(128)} `

      expect(yield* decodeMonitorName(atLimit)).toBe('x'.repeat(128))
    }),
  )

  it.effect('rejects a name that is too long after trimming', () =>
    Effect.gen(function* () {
      const error = yield* decodeMonitorName(` ${'x'.repeat(129)} `).pipe(Effect.flip)

      expect(error).toBeInstanceOf(Schema.SchemaError)
    }),
  )

  it.effect('rejects a name that is blank after trimming', () =>
    Effect.gen(function* () {
      for (const input of ['', '   ']) {
        const error = yield* decodeMonitorName(input).pipe(Effect.flip)

        expect(error).toBeInstanceOf(Schema.SchemaError)
      }
    }),
  )
})

describe('MonitorDefinition', () => {
  it.effect('decodes wire input, defaulting headers and parsing the schedule', () =>
    Effect.gen(function* () {
      const definition = yield* makeDefinition()

      expect(definition.request.headers).toEqual({})
      expect(Cron.isCron(definition.cronSchedule)).toBe(true)
      expect(Cron.format(definition.cronSchedule)).toBe('0-55/5 * * * *')
    }),
  )

  it.effect('encodes the parsed schedule back to its expression', () =>
    Effect.gen(function* () {
      const definition = yield* makeDefinition()

      const encoded = yield* encodeDefinition(definition)

      expect(encoded.cronSchedule).toBe('0-55/5 * * * *')
    }),
  )

  it.effect('rejects a missing request or an invalid schedule', () =>
    Effect.gen(function* () {
      const invalid: ReadonlyArray<unknown> = [
        { cronSchedule: '*/5 * * * *' },
        { ...definitionJson, cronSchedule: 'not a cron' },
      ]

      for (const input of invalid) {
        const error = yield* decodeDefinition(input).pipe(Effect.flip)

        expect(error).toBeInstanceOf(Schema.SchemaError)
      }
    }),
  )
})

describe('Monitor', () => {
  it.effect('defaults createdAt to an ISO timestamp on insert', () =>
    Effect.gen(function* () {
      const insert = makeInsert(yield* makeDefinition())

      expect(Option.isSome(DateTime.make(insert.createdAt))).toBe(true)
    }),
  )

  it.effect('stores the request as JSON text and createdAt as a string', () =>
    Effect.gen(function* () {
      const definition = yield* makeDefinition()

      const encoded = yield* encodeInsert(makeInsert(definition))

      expect(typeof encoded.request).toBe('string')
      expect(JSON.parse(encoded.request)).toEqual(definition.request)
      expect(typeof encoded.createdAt).toBe('string')
    }),
  )

  it.effect('round-trips a monitor through its JSON codec', () =>
    Effect.gen(function* () {
      const wire = {
        id: uuid,
        name: 'Prod API',
        request: { ...definitionJson.request, headers: {} },
        cronSchedule: '0-55/5 * * * *',
        createdAt: '2026-09-13T00:00:00.000Z',
      }

      const encoded = yield* encodeMonitor(yield* decodeMonitor(wire))

      expect(encoded).toEqual(wire)
    }),
  )
})
