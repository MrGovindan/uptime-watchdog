import {
  type MonitorHealth,
  Monitor,
  type NotificationTarget,
  WatchdogEvent,
} from '@uptime-watchdog/common'
import { Dialog } from '@foldkit/ui'
import { DateTime, Duration, Option, Schema } from 'effect'
import { Valid } from 'foldkit/fieldValidation'
import { evo } from 'foldkit/struct'

import { MonitorsAsyncData, makeInitialModel } from './model'
import { makeInitialForm } from './monitorForm'

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
  expectedStatus: 200,
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
    expectedStatus: Valid({ value: '200' }),
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
    expectedStatus: Valid({ value: '200' }),
    cronSchedule: Valid({ value: '*/5 * * * *' }),
  }),
})

const healthy: MonitorHealth = {
  _tag: 'Healthy',
  time: DateTime.nowUnsafe(),
  response: { duration: Duration.millis(5), status: 200, body: 'pong' },
}

const degraded: MonitorHealth = {
  _tag: 'Degraded',
  time: DateTime.nowUnsafe(),
  reason: {
    _tag: 'Unexpected',
    response: { duration: Duration.millis(5), status: 503, body: 'down' },
  },
}

const notificationTarget: NotificationTarget = {
  monitorId: monitor.id,
  mattermostUserId: 'mm-jesse',
  mattermostUsername: 'jesse',
  mattermostDisplayName: 'Jesse Duffield',
  createdAt: DateTime.nowUnsafe(),
}

export const monitorRegisteredEvent: WatchdogEvent = { _tag: 'MonitorRegistered', monitor }
export const monitorUpdatedEvent: WatchdogEvent = {
  _tag: 'MonitorUpdated',
  monitor: updatedMonitor,
}
export const monitorDeletedEvent: WatchdogEvent = {
  _tag: 'MonitorDeleted',
  monitor,
  targets: [],
}
export const monitorHealthyEvent: WatchdogEvent = {
  _tag: 'MonitorHealthy',
  monitor: updatedMonitor,
  health: healthy,
}
export const monitorDegradedEvent: WatchdogEvent = {
  _tag: 'MonitorDegraded',
  monitor: updatedMonitor,
  health: degraded,
}
export const monitorHealedEvent: WatchdogEvent = {
  _tag: 'MonitorHealed',
  monitor: updatedMonitor,
  health: healthy,
}
export const notificationTargetAddedEvent: WatchdogEvent = {
  _tag: 'NotificationTargetAdded',
  monitor,
  target: notificationTarget,
}
