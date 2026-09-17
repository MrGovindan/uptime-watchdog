import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), foldkit({ devToolsMcpPort: 9988 })],
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
