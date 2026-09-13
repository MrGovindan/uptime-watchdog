import { Array, Order, pipe, Record, String } from 'effect'
import createMonitor from './202609131200_create_monitor'

const migrations = [['202609131200_create_monitor', createMonitor]] as const

const MigrationOrdering = <T>() =>
  Order.make<readonly [string, T]>((a, b) => String.Order(a[0], b[0]))

const sortedMigrations = Array.sort(migrations, MigrationOrdering())

export const migrationSet = pipe(Record.fromEntries(sortedMigrations))
