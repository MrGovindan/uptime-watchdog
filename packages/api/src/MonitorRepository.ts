import { Monitor, type MonitorDefinition, MonitorId } from '@uptime-watchdog/common'
import { Context, Effect, Layer, Option, Schema } from 'effect'
import { SqlClient, SqlModel, SqlSchema } from 'effect/unstable/sql'

export interface Interface {
  readonly register: (definition: MonitorDefinition) => Effect.Effect<Monitor>
  readonly list: Effect.Effect<ReadonlyArray<Monitor>>
  readonly find: (id: MonitorId) => Effect.Effect<Option.Option<Monitor>>
  readonly delete: (id: MonitorId) => Effect.Effect<Option.Option<Monitor>>
}

export class MonitorRepository extends Context.Service<MonitorRepository, Interface>()(
  'MonitorRepository',
) {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const model = yield* SqlModel.makeRepository(Monitor, {
    tableName: 'monitor',
    idColumn: 'id',
    spanPrefix: 'MonitorRepository',
  })

  const register = Effect.fn('MonitorRepository.register')(function* (
    definition: MonitorDefinition,
  ) {
    const monitor = yield* model
      .insert(
        Monitor.insert.make({
          id: MonitorId.make(crypto.randomUUID()),
          name: definition.name,
          request: definition.request,
          cronSchedule: definition.cronSchedule,
        }),
      )
      .pipe(Effect.orDie)

    return monitor
  })

  const list = SqlSchema.findAll({
    Request: Schema.Struct({}),
    Result: Monitor,
    execute: () =>
      sql`SELECT id, name, request, cronSchedule, createdAt FROM monitor ORDER BY createdAt DESC`,
  })({}).pipe(Effect.orDie)

  const find = (id: MonitorId): Effect.Effect<Option.Option<Monitor>> =>
    SqlSchema.findOneOption({
      Request: Schema.Struct({ id: MonitorId }),
      Result: Monitor,
      execute: ({ id }) =>
        sql`SELECT id, name, request, cronSchedule, createdAt FROM monitor WHERE id = ${id} LIMIT 1`,
    })({ id }).pipe(Effect.orDie)

  const deleteMonitor = (id: MonitorId): Effect.Effect<Option.Option<Monitor>> =>
    SqlSchema.findOneOption({
      Request: Schema.Struct({ id: MonitorId }),
      Result: Monitor,
      execute: ({ id }) => sql`
        DELETE FROM monitor WHERE id = ${id}
        RETURNING id, name, request, cronSchedule, createdAt
      `,
    })({ id }).pipe(Effect.orDie)

  return { register, list, find, delete: deleteMonitor }
})

export const layer = Layer.effect(MonitorRepository, make)
