import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as SqliteMigrator from '@effect/sql-sqlite-bun/SqliteMigrator'
import { Effect, Layer } from 'effect'
import { SqlClient } from 'effect/unstable/sql'
import { migrationSet } from '../migrations'

export const layer = (filename: string) => {
  const client = SqliteClient.layer({ filename, create: true })

  const foreignKeys = Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`PRAGMA foreign_keys = ON`
    }),
  ).pipe(Layer.provide(client))

  const migrator = SqliteMigrator.layer({
    loader: SqliteMigrator.fromRecord(migrationSet),
    table: 'migration',
  }).pipe(Layer.provide(client))

  return Layer.mergeAll(client, foreignKeys, migrator)
}
