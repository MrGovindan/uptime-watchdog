import { Config } from 'effect'

export const staticRoot = Config.String('STATIC_ROOT').pipe(
  Config.withDefault(`${import.meta.dir}/../../web/dist`),
)

export const port = Config.Port('PORT').pipe(Config.withDefault(3000))

export const databasePath = Config.String('DATABASE_PATH').pipe(
  Config.withDefault('./data/uptime-watchdog.db'),
)

export const server = Config.all({
  staticRoot,
  port,
  databasePath,
})

export type Server = Config.Success<typeof server>
