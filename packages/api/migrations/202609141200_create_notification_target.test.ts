import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SqlClient } from 'effect/unstable/sql'
import createMonitor from './202609131200_create_monitor'
import createNotificationTarget from './202609141200_create_notification_target'

interface Column {
  readonly name: string
  readonly type: string
  readonly notnull: number
  readonly pk: number
}

const expectedColumns: ReadonlyArray<Column> = [
  { name: 'monitorId', type: 'TEXT', notnull: 1, pk: 1 },
  { name: 'mattermostUserId', type: 'TEXT', notnull: 1, pk: 2 },
  { name: 'mattermostUsername', type: 'TEXT', notnull: 1, pk: 0 },
  { name: 'mattermostDisplayName', type: 'TEXT', notnull: 1, pk: 0 },
  { name: 'createdAt', type: 'TEXT', notnull: 1, pk: 0 },
]

const notificationTargetColumns = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const columns = yield* sql<Column>`PRAGMA table_info(notification_target)`

  return columns.map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }))
})

const foreignKeys = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  return yield* sql<{ readonly table: string; readonly on_delete: string }>`
    PRAGMA foreign_key_list(notification_target)
  `
})

const inMemoryDatabase = SqliteClient.layer({ filename: ':memory:' })

describe('202609141200_create_notification_target', () => {
  it.effect('creates the notification_target table with the expected schema', () =>
    Effect.gen(function* () {
      yield* createMonitor
      yield* createNotificationTarget

      expect(yield* notificationTargetColumns).toEqual(expectedColumns)
    }).pipe(Effect.provide(inMemoryDatabase)),
  )

  it.effect('cascades deletes from the monitor table', () =>
    Effect.gen(function* () {
      yield* createMonitor
      yield* createNotificationTarget

      const keys = yield* foreignKeys

      expect(keys).toEqual([expect.objectContaining({ table: 'monitor', on_delete: 'CASCADE' })])
    }).pipe(Effect.provide(inMemoryDatabase)),
  )
})
