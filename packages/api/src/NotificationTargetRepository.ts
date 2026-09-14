import {
  type MattermostUser,
  MattermostUserId,
  MonitorId,
  NotificationTarget,
  NotificationTargetAlreadyExists,
} from '@uptime-watchdog/common'
import { Array, Context, Effect, Layer, Option, Schema } from 'effect'
import { SqlClient, SqlError, SqlSchema } from 'effect/unstable/sql'

export interface Interface {
  readonly list: (monitorId: MonitorId) => Effect.Effect<ReadonlyArray<NotificationTarget>>
  readonly add: (
    monitorId: MonitorId,
    user: MattermostUser,
  ) => Effect.Effect<NotificationTarget, NotificationTargetAlreadyExists>
  readonly remove: (
    monitorId: MonitorId,
    mattermostUserId: MattermostUserId,
  ) => Effect.Effect<Option.Option<NotificationTarget>>
}

export class NotificationTargetRepository extends Context.Service<
  NotificationTargetRepository,
  Interface
>()('NotificationTargetRepository') {}

const isConflict = (error: SqlError.SqlError): boolean =>
  error.reason._tag === 'UniqueViolation' || error.reason._tag === 'ConstraintError'

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const list = (monitorId: MonitorId): Effect.Effect<ReadonlyArray<NotificationTarget>> =>
    SqlSchema.findAll({
      Request: Schema.Struct({ monitorId: MonitorId }),
      Result: NotificationTarget,
      execute: ({ monitorId }) => sql`
        SELECT monitorId, mattermostUserId, mattermostUsername, mattermostDisplayName, createdAt
        FROM notification_target
        WHERE monitorId = ${monitorId}
        ORDER BY createdAt ASC
      `,
    })({ monitorId }).pipe(Effect.orDie)

  const add = Effect.fn('NotificationTargetRepository.add')(function* (
    monitorId: MonitorId,
    user: MattermostUser,
  ) {
    const rows = yield* SqlSchema.findAll({
      Request: NotificationTarget.insert,
      Result: NotificationTarget,
      execute: ({
        monitorId,
        mattermostUserId,
        mattermostUsername,
        mattermostDisplayName,
        createdAt,
      }) => sql`
        INSERT INTO notification_target
          (monitorId, mattermostUserId, mattermostUsername, mattermostDisplayName, createdAt)
        VALUES
          (${monitorId}, ${mattermostUserId}, ${mattermostUsername}, ${mattermostDisplayName}, ${createdAt})
        RETURNING monitorId, mattermostUserId, mattermostUsername, mattermostDisplayName, createdAt
      `,
    })(
      NotificationTarget.insert.make({
        monitorId,
        mattermostUserId: user.id,
        mattermostUsername: user.username,
        mattermostDisplayName: user.displayName,
      }),
    ).pipe(
      Effect.catchTags({
        SqlError: (error) =>
          isConflict(error)
            ? Effect.fail(
                new NotificationTargetAlreadyExists({ monitorId, mattermostUserId: user.id }),
              )
            : Effect.die(error),
        SchemaError: (error) => Effect.die(error),
      }),
    )

    return yield* Option.match(Array.head(rows), {
      onNone: () => Effect.die(new Error('INSERT ... RETURNING returned no row')),
      onSome: (target) => Effect.succeed(target),
    })
  })

  const remove = (
    monitorId: MonitorId,
    mattermostUserId: MattermostUserId,
  ): Effect.Effect<Option.Option<NotificationTarget>> =>
    SqlSchema.findOneOption({
      Request: Schema.Struct({ monitorId: MonitorId, mattermostUserId: MattermostUserId }),
      Result: NotificationTarget,
      execute: ({ monitorId, mattermostUserId }) => sql`
        DELETE FROM notification_target
        WHERE monitorId = ${monitorId} AND mattermostUserId = ${mattermostUserId}
        RETURNING monitorId, mattermostUserId, mattermostUsername, mattermostDisplayName, createdAt
      `,
    })({ monitorId, mattermostUserId }).pipe(Effect.orDie)

  return { list, add, remove } satisfies Interface
})

export const layer = Layer.effect(NotificationTargetRepository, make)
