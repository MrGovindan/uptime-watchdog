import { describe, expect, it } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { SqlClient } from 'effect/unstable/sql'
import * as Database from './Database'

describe('Database', () => {
  it.effect('enforces foreign keys on the connection', () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const result = yield* Effect.exit(sql`
        INSERT INTO notification_target
          (monitorId, mattermostUserId, mattermostUsername, mattermostDisplayName, createdAt)
        VALUES
          ('missing-monitor', 'mm-jesse', 'jesse', 'Jesse', '2026-09-14T00:00:00.000Z')
      `)

      expect(Exit.isFailure(result)).toBe(true)
    }).pipe(Effect.provide(Database.layer(':memory:'))),
  )
})
