import { Effect } from 'effect'
import { SqlClient } from 'effect/unstable/sql'

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE notification_target (
      monitorId TEXT NOT NULL,
      mattermostUserId TEXT NOT NULL,
      mattermostUsername TEXT NOT NULL,
      mattermostDisplayName TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (monitorId, mattermostUserId),
      FOREIGN KEY (monitorId) REFERENCES monitor(id) ON DELETE CASCADE
    )
  `
})
