import { defineConfig, type Plugin } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

// The foldkit plugin force-includes `effect/Schema`, while this app imports
// `effect/schema` (for `Model`). Vite's optimizer deconflicts the two entry
// filenames case-insensitively, emitting `effect_schema2.js`, which it then
// fails to map back to a dependency. Drop the redundant forced include; the
// app's `effect/schema` graph already bundles `effect/Schema` as a shared chunk.
const dropRedundantEffectSchemaInclude = (): Plugin => ({
  name: 'uptime-watchdog:drop-redundant-effect-schema-include',
  configResolved(config) {
    const include = config.optimizeDeps.include
    if (include !== undefined) {
      config.optimizeDeps.include = include.filter((id) => id !== 'effect/Schema')
    }
  },
})

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9988 }), dropRedundantEffectSchemaInclude()],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
  server: {
    proxy: {
      '/monitor': 'http://localhost:3000',
      '/notification': 'http://localhost:3000',
      '/cron': 'http://localhost:3000',
      // Keep in sync with WATCHDOG_RPC_PATH from @uptime-watchdog/common.
      '/rpc': { target: 'http://localhost:3000', ws: true },
    },
  },
})
