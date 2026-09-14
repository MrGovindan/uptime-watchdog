import type { MonitorName } from '@uptime-watchdog/common'

export const addedToMonitor = (monitorName: MonitorName): string =>
  `You were added as a notification target for monitor "${monitorName}". You'll be notified when it is disrupted.`

export const removedFromMonitor = (monitorName: MonitorName): string =>
  `You were removed as a notification target for monitor "${monitorName}". You'll no longer be notified when it is disrupted.`

export const monitorDeleted = (monitorName: MonitorName): string =>
  `The monitor "${monitorName}" was deleted, so you will no longer be notified.`

export const testForMonitor = (): string => 'This is a test notification from Uptime Watchdog.'
