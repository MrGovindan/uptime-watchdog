import { Config } from 'effect'

export const staticRoot = Config.String('STATIC_ROOT').pipe(
  Config.withDefault(`${import.meta.dir}/../../web/dist`),
)

export const port = Config.Port('PORT').pipe(Config.withDefault(3000))

export const databasePath = Config.String('DATABASE_PATH')

export const mattermostBaseUrl = Config.URL('MATTERMOST_BASE_URL')

export const mattermostApiToken = Config.Redacted('MATTERMOST_API_TOKEN')

export const openCodeModel = Config.String('OPENCODE_MODEL')

export const openCodeApiKey = Config.Redacted('OPENCODE_API_KEY')

export const openCodeUrl = Config.URL('OPENCODE_URL')

export const OpenCode = Config.all({
  apiKey: openCodeApiKey,
  model: openCodeModel,
  url: openCodeUrl,
})

export const Server = Config.all({
  staticRoot,
  port,
  databasePath,
})

export const Mattermost = Config.all({
  baseUrl: mattermostBaseUrl,
  apiToken: mattermostApiToken,
})

export type Server = Config.Success<typeof Server>
export type Mattermost = Config.Success<typeof Mattermost>
export type OpenCode = Config.Success<typeof OpenCode>
