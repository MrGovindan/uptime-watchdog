import { Schema } from 'effect'
import { Monitor } from './Monitor'
import { MonitorHealth } from './MonitorHealth'
import { NotificationTarget } from './NotificationTarget'

export const WatchdogEvent = Schema.TaggedUnion({
  MonitorRegistered: { monitor: Monitor },
  MonitorUpdated: { monitor: Monitor },
  MonitorDeleted: { monitor: Monitor, targets: Schema.Array(NotificationTarget) },
  NotificationTargetAdded: { monitor: Monitor, target: NotificationTarget },
  NotificationTargetRemoved: { monitor: Monitor, target: NotificationTarget },
  MonitorHealthy: { monitor: Monitor, health: MonitorHealth },
  MonitorDegraded: { monitor: Monitor, health: MonitorHealth },
  MonitorHealed: { monitor: Monitor, health: MonitorHealth },
})
export type WatchdogEvent = typeof WatchdogEvent.Type
