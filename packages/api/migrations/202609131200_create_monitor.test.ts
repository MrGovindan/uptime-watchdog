import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as SqliteMigrator from '@effect/sql-sqlite-bun/SqliteMigrator'
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SqlClient } from 'effect/unstable/sql'
import createMonitor from './202609131200_create_monitor'
import { migrationSet } from './index'

interface MonitorColumn {
  readonly name: string
  readonly type: string
  readonly notnull: number
  readonly pk: number
}

const expectedColumns: ReadonlyArray<MonitorColumn> = [
  { name: 'id', type: 'TEXT', notnull: 1, pk: 1 },
  { name: 'name', type: 'TEXT', notnull: 1, pk: 0 },
  { name: 'request', type: 'TEXT', notnull: 1, pk: 0 },
  { name: 'cronSchedule', type: 'TEXT', notnull: 1, pk: 0 },
  { name: 'createdAt', type: 'TEXT', notnull: 1, pk: 0 },
]

const monitorColumns = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const columns = yield* sql<MonitorColumn>`PRAGMA table_info(monitor)`

  return columns.map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }))
})

const inMemoryDatabase = SqliteClient.layer({ filename: ':memory:' })

describe('202609131200_create_monitor', () => {
  it.effect('creates the monitor table with the expected schema', () =>
    Effect.gen(function* () {
      yield* createMonitor

      expect(yield* monitorColumns).toEqual(expectedColumns)
    }).pipe(Effect.provide(inMemoryDatabase)),
  )

  it.effect('is applied by the migrations record', () =>
    Effect.gen(function* () {
      const applied = yield* SqliteMigrator.run({
        loader: SqliteMigrator.fromRecord(migrationSet),
      })

      expect(applied).toEqual([[202609131200, 'create_monitor']])
    }).pipe(Effect.provide(inMemoryDatabase)),
  )
})
