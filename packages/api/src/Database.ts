import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as SqliteMigrator from '@effect/sql-sqlite-bun/SqliteMigrator'
import { Layer } from 'effect'
import { migrationSet } from '../migrations'

export const layer = (filename: string) => {
  const client = SqliteClient.layer({ filename })

  const migrator = SqliteMigrator.layer({
    loader: SqliteMigrator.fromRecord(migrationSet),
    table: 'migration',
  }).pipe(Layer.provide(client))

  return Layer.merge(client, migrator)
}
