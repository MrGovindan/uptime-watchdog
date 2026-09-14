import { Effect } from 'effect'
import { SqlClient } from 'effect/unstable/sql'

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE monitor (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      request TEXT NOT NULL,
      cronSchedule TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `
})
