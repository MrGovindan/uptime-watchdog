import { Monitor, type MonitorDefinition, MonitorId } from '@uptime-watchdog/common'
import { Context, Effect, Layer, Schema } from 'effect'
import { SqlClient, SqlModel, SqlSchema } from 'effect/unstable/sql'

export interface Interface {
  readonly register: (definition: MonitorDefinition) => Effect.Effect<Monitor>
  readonly list: Effect.Effect<ReadonlyArray<Monitor>>
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
    return yield* model
      .insert(
        Monitor.insert.make({
          id: MonitorId.make(crypto.randomUUID()),
          request: definition.request,
          cronSchedule: definition.cronSchedule,
        }),
      )
      .pipe(Effect.orDie)
  })

  const list = SqlSchema.findAll({
    Request: Schema.Struct({}),
    Result: Monitor,
    execute: () =>
      sql`SELECT id, request, cronSchedule, createdAt FROM monitor ORDER BY createdAt DESC`,
  })({}).pipe(Effect.orDie)

  return { register, list }
})

export const layer = Layer.effect(MonitorRepository, make)
