import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'
import addNotificationTargetWindow from './202610120900_add_notification_target_window'
import createMonitor from './202609131200_create_monitor'
import createNotificationTarget from './202609141200_create_notification_target'

interface Column {
  readonly name: string
  readonly type: string
  readonly notnull: number
  readonly pk: number
}

const windowColumn = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const columns = yield* sql<Column>`PRAGMA table_info(notification_target)`
  const found = columns.find((column) => column.name === 'window')

  return found === undefined ? undefined : { name: found.name, type: found.type, notnull: found.notnull, pk: found.pk }
})

const inMemoryDatabase = SqliteClient.layer({ filename: ':memory:' })

describe('202610120900_add_notification_target_window', () => {
  it.effect('adds a nullable window column to notification_target', () =>
    Effect.gen(function* () {
      yield* createMonitor
      yield* createNotificationTarget
      yield* addNotificationTargetWindow

      expect(yield* windowColumn).toEqual({ name: 'window', type: 'TEXT', notnull: 0, pk: 0 })
    }).pipe(Effect.provide(inMemoryDatabase)),
  )
})
