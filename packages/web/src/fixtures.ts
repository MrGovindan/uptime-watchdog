import { Monitor } from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { Valid } from 'foldkit/fieldValidation'
import { evo } from 'foldkit/struct'

import { MonitorsAsyncData, makeInitialForm, makeInitialModel } from './main'

export const monitorJson = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  name: 'Prod API',
  request: {
    hostname: 'example.com',
    port: 443,
    protocol: 'https',
    method: 'GET',
    headers: {},
  },
  cronSchedule: '*/5 * * * *',
  createdAt: '2026-09-13T12:00:00.000Z',
} as const

export const monitor = Schema.decodeSync(Monitor.json)(monitorJson)

export const modelWithEmptyList = evo(makeInitialModel(), {
  monitors: () => MonitorsAsyncData.Success({ data: [] }),
})

export const modelWithMonitors = evo(makeInitialModel(), {
  monitors: () => MonitorsAsyncData.Success({ data: [monitor] }),
})

export const modelWithOpenDialog = evo(modelWithEmptyList, {
  dialog: () => Dialog.init({ id: 'add-monitor-dialog', isOpen: true }),
})

export const modelReadyToCreate = evo(modelWithOpenDialog, {
  form: () => ({
    ...makeInitialForm(),
    name: Valid({ value: 'Prod API' }),
    hostname: Valid({ value: 'example.com' }),
    port: Valid({ value: '443' }),
    cronSchedule: Valid({ value: '*/5 * * * *' }),
  }),
})

export const updatedMonitor = Schema.decodeSync(Monitor.json)({
  ...monitorJson,
  name: 'Renamed API',
})

export const modelReadyToEdit = evo(modelWithMonitors, {
  dialog: () => Dialog.init({ id: 'add-monitor-dialog', isOpen: true }),
  editingMonitorId: () => Option.some(monitor.id),
  form: () => ({
    ...makeInitialForm(),
    name: Valid({ value: 'Prod API' }),
    hostname: Valid({ value: 'example.com' }),
    port: Valid({ value: '443' }),
    cronSchedule: Valid({ value: '*/5 * * * *' }),
  }),
})
