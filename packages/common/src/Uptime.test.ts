import { describe, expect, it } from '@effect/vitest'
import { Cron, Effect, Schema } from 'effect'

import { CronExpression, UptimeRequest } from './Uptime'

const decodeCron = Schema.decodeUnknownEffect(CronExpression)
const encodeCron = Schema.encodeUnknownEffect(CronExpression)
const decodeRequest = Schema.decodeUnknownEffect(UptimeRequest)

const baseRequest = {
  hostname: 'example.test',
  port: 8080,
  protocol: 'https' as const,
  method: 'GET' as const,
  headers: {},
}

describe('CronExpression', () => {
  it.effect('decodes an expression into a parsed schedule', () =>
    Effect.gen(function* () {
      const cron = yield* decodeCron('*/5 * * * *')

      expect(Cron.format(cron)).toBe('0-55/5 * * * *')
    }),
  )

  it.effect('round-trips through encode and decode', () =>
    Effect.gen(function* () {
      const encoded = yield* encodeCron(yield* decodeCron('0 9 * * 1-5'))

      expect(encoded).toBe('0 9 * * 1-5')
    }),
  )

  it.effect('rejects an invalid expression', () =>
    Effect.gen(function* () {
      const error = yield* decodeCron('not a cron').pipe(Effect.flip)

      expect(error).toBeInstanceOf(Schema.SchemaError)
    }),
  )
})

describe('UptimeRequest', () => {
  it.effect('trims hostname and path and defaults headers to an empty object', () =>
    Effect.gen(function* () {
      const request = yield* decodeRequest({
        ...baseRequest,
        hostname: '  example.test  ',
        path: '  health  ',
      })

      expect(request.hostname).toBe('example.test')
      expect(request.path).toBe('health')
      expect(request.headers).toEqual({})
    }),
  )

  it.effect('allows the path to be omitted', () =>
    Effect.gen(function* () {
      const request = yield* decodeRequest(baseRequest)

      expect(request.path).toBeUndefined()
    }),
  )

  it.effect('preserves provided headers', () =>
    Effect.gen(function* () {
      const request = yield* decodeRequest({
        ...baseRequest,
        headers: { 'x-check-token': 'secret' },
      })

      expect(request.headers).toEqual({ 'x-check-token': 'secret' })
    }),
  )

  it.effect('trims header keys and values', () =>
    Effect.gen(function* () {
      const request = yield* decodeRequest({
        ...baseRequest,
        headers: { 'x-check-token  ': '  secret' },
      })

      expect(request.headers).toEqual({ 'x-check-token': 'secret' })
    }),
  )

  it.effect('rejects values outside the schema', () =>
    Effect.gen(function* () {
      const invalid: ReadonlyArray<unknown> = [
        { ...baseRequest, hostname: '   ' },
        { ...baseRequest, port: 0 },
        { ...baseRequest, port: -1 },
        { ...baseRequest, port: 80.5 },
        { ...baseRequest, protocol: 'ftp' },
        { ...baseRequest, method: 'NOPE' },
        { ...baseRequest, path: '   ' },
        { ...baseRequest, headers: { 'x-check-token': 1 } },
      ]

      for (const input of invalid) {
        const error = yield* decodeRequest(input).pipe(Effect.flip)

        expect(error).toBeInstanceOf(Schema.SchemaError)
      }
    }),
  )
})
