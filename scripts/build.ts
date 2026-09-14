import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const buildsDir = join(root, 'builds')
const webDir = join(root, 'packages/web')
const apiEntry = join(root, 'packages/api/src/index.ts')
const viteBin = join(webDir, 'node_modules/vite/bin/vite.js')

const KEEP_BUILDS = 5
const BUILD_FOLDER = /^\d{8}_\d{4}$/

const pad = (value: number): string => String(value).padStart(2, '0')

const formatTimestamp = (date: Date): string =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${pad(
    date.getUTCHours(),
  )}${pad(date.getUTCMinutes())}`

const run = async (command: ReadonlyArray<string>, cwd: string): Promise<void> => {
  const process_ = Bun.spawn([...command], { cwd, stdout: 'inherit', stderr: 'inherit' })
  const exitCode = await process_.exited
  if (exitCode !== 0) {
    throw new Error(`command failed with exit code ${exitCode}: ${command.join(' ')}`)
  }
}

const runScript = [
  '#!/bin/sh',
  'set -eu',
  'DIR="$(cd "$(dirname "$0")" && pwd)"',
  ': "${DATABASE_PATH:?DATABASE_PATH is required (see .prod.env.example)}"',
  'export STATIC_ROOT="$DIR/web"',
  'export PORT="${PORT:-3000}"',
  'exec bun "$DIR/server.js"',
  '',
].join('\n')

const publishCurrent = (timestamp: string): void => {
  const temporaryLink = join(buildsDir, `.current-${process.pid}`)
  rmSync(temporaryLink, { force: true })
  symlinkSync(timestamp, temporaryLink)
  renameSync(temporaryLink, join(buildsDir, 'current'))
}

const pruneBuilds = (): void => {
  const builds = readdirSync(buildsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BUILD_FOLDER.test(entry.name))
    .map((entry) => entry.name)
    .sort()

  for (const name of builds.slice(0, Math.max(0, builds.length - KEEP_BUILDS))) {
    rmSync(join(buildsDir, name), { recursive: true, force: true })
  }
}

const main = async (): Promise<void> => {
  mkdirSync(join(buildsDir, 'data'), { recursive: true })

  const timestamp = formatTimestamp(new Date())
  const finalDir = join(buildsDir, timestamp)

  if (existsSync(finalDir)) {
    throw new Error(
      `build ${timestamp} already exists; builds are timestamped to the minute in UTC, retry shortly`,
    )
  }

  const staging = join(buildsDir, `.tmp-${process.pid}-${Date.now()}`)
  mkdirSync(join(staging, 'web'), { recursive: true })

  try {
    await run(
      [
        process.execPath,
        'build',
        apiEntry,
        '--target=bun',
        '--outfile',
        join(staging, 'server.js'),
      ],
      root,
    )

    await run(
      [process.execPath, viteBin, 'build', '--outDir', join(staging, 'web'), '--emptyOutDir'],
      webDir,
    )

    await Bun.write(join(staging, 'run'), runScript)
    chmodSync(join(staging, 'run'), 0o755)

    renameSync(staging, finalDir)
    publishCurrent(timestamp)
    pruneBuilds()

    console.log(`\nBuilt ${finalDir}`)
    console.log(`Run with: bun run start (via builds/current)`)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

await main()
