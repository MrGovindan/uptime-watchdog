import { Array, Order, pipe, Record, String } from 'effect'
import createMonitor from './202609131200_create_monitor'
import createNotificationTarget from './202609141200_create_notification_target'

const migrations = [
  ['202609131200_create_monitor', createMonitor],
  ['202609141200_create_notification_target', createNotificationTarget],
] as const

const MigrationOrdering = <T>() =>
  Order.make<readonly [string, T]>((a, b) => String.Order(a[0], b[0]))

const sortedMigrations = Array.sort(migrations, MigrationOrdering())

export const migrationSet = pipe(Record.fromEntries(sortedMigrations))
