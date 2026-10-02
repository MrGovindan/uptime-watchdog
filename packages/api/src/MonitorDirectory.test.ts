import { type WatchdogEvent, MonitorDefinition, MonitorId } from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import * as MonitorDirectory from './MonitorDirectory'
import { definitionJson, mattermostUser, servicesLayer } from './testing'
import * as WatchdogEvents from './WatchdogEvents'

const unknownMonitorId = MonitorId.make('00000000-0000-4000-8000-000000000000')

const definition = Effect.runSync(Schema.decodeUnknownEffect(MonitorDefinition)(definitionJson))

const updatedJson = { ...definitionJson, name: 'Renamed API' }
const updatedDefinition = Effect.runSync(Schema.decodeUnknownEffect(MonitorDefinition)(updatedJson))

type Env = Readonly<{ directory: MonitorDirectory.Interface; received: Queue.Queue<WatchdogEvent> }>

const withDirectory = <A, E>(run: (env: Env) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const directory = yield* MonitorDirectory.MonitorDirectory
    const events = yield* WatchdogEvents.WatchdogEvents
    const received = yield* Queue.unbounded<WatchdogEvent>()

    yield* events.stream.pipe(
      Stream.runForEach((event) => Queue.offer(received, event).pipe(Effect.asVoid)),
      Effect.forkChild,
    )
    yield* Effect.yieldNow

    return yield* run({ directory, received })
  }).pipe(Effect.provide(servicesLayer({ checkUptime: () => Effect.never })))

describe('MonitorDirectory', () => {
  it.effect('register publishes MonitorRegistered for the created monitor', () =>
    withDirectory(({ directory, received }) =>
      Effect.gen(function* () {
        const monitor = yield* directory.register(definition)

        expect(yield* Queue.take(received)).toMatchObject({
          _tag: 'MonitorRegistered',
          monitor: { id: monitor.id, name: 'Prod API' },
        })
      }),
    ),
  )

  it.effect('update publishes MonitorUpdated for the stored monitor', () =>
    withDirectory(({ directory, received }) =>
      Effect.gen(function* () {
        const created = yield* directory.register(definition)
        yield* Queue.take(received)

        const updated = yield* directory.update(created.id, updatedDefinition)

        expect(updated.name).toBe('Renamed API')
        expect(yield* Queue.take(received)).toMatchObject({
          _tag: 'MonitorUpdated',
          monitor: { id: created.id, name: 'Renamed API' },
        })
      }),
    ),
  )

  it.effect('update rejects an unknown monitor with MonitorNotFound', () =>
    withDirectory(({ directory }) =>
      Effect.gen(function* () {
        const error = yield* directory.update(unknownMonitorId, updatedDefinition).pipe(Effect.flip)

        expect(error).toMatchObject({ _tag: 'MonitorNotFound' })
      }),
    ),
  )

  it.effect('delete publishes MonitorDeleted carrying the monitor targets', () =>
    withDirectory(({ directory, received }) =>
      Effect.gen(function* () {
        const created = yield* directory.register(definition)
        yield* Queue.take(received)
        const target = yield* directory.addTarget(created.id, mattermostUser.id)
        yield* Queue.take(received)

        yield* directory.delete(created.id)

        expect(yield* Queue.take(received)).toMatchObject({
          _tag: 'MonitorDeleted',
          monitor: { id: created.id },
          targets: [{ mattermostUserId: target.mattermostUserId }],
        })
      }),
    ),
  )

  it.effect('delete rejects an unknown monitor with MonitorNotFound', () =>
    withDirectory(({ directory }) =>
      Effect.gen(function* () {
        const error = yield* directory.delete(unknownMonitorId).pipe(Effect.flip)

        expect(error).toMatchObject({ _tag: 'MonitorNotFound' })
      }),
    ),
  )

  it.effect('addTarget resolves the mattermost user and publishes NotificationTargetAdded', () =>
    withDirectory(({ directory, received }) =>
      Effect.gen(function* () {
        const created = yield* directory.register(definition)
        yield* Queue.take(received)

        const target = yield* directory.addTarget(created.id, mattermostUser.id)

        expect(target).toMatchObject({
          mattermostUserId: 'mm-jesse',
          mattermostUsername: 'jesse',
          mattermostDisplayName: 'Jesse Duffield',
        })
        expect(yield* Queue.take(received)).toMatchObject({
          _tag: 'NotificationTargetAdded',
          monitor: { id: created.id },
          target: { mattermostUserId: 'mm-jesse' },
        })
      }),
    ),
  )

  it.effect('addTarget rejects an unknown monitor with MonitorNotFound', () =>
    withDirectory(({ directory }) =>
      Effect.gen(function* () {
        const error = yield* directory.addTarget(unknownMonitorId, mattermostUser.id).pipe(Effect.flip)

        expect(error).toMatchObject({ _tag: 'MonitorNotFound' })
      }),
    ),
  )

  it.effect('removeTarget publishes NotificationTargetRemoved only when a target was removed', () =>
    withDirectory(({ directory, received }) =>
      Effect.gen(function* () {
        const created = yield* directory.register(definition)
        yield* Queue.take(received)
        yield* directory.addTarget(created.id, mattermostUser.id)
        yield* Queue.take(received)

        yield* directory.removeTarget(created.id, mattermostUser.id)
        expect(yield* Queue.take(received)).toMatchObject({
          _tag: 'NotificationTargetRemoved',
          monitor: { id: created.id },
          target: { mattermostUserId: 'mm-jesse' },
        })

        yield* directory.removeTarget(created.id, mattermostUser.id)
        yield* Effect.yieldNow
        expect(Option.isNone(yield* Queue.poll(received))).toBe(true)
      }),
    ),
  )

  it.effect('listTargets rejects an unknown monitor with MonitorNotFound', () =>
    withDirectory(({ directory }) =>
      Effect.gen(function* () {
        const error = yield* directory.listTargets(unknownMonitorId).pipe(Effect.flip)

        expect(error).toMatchObject({ _tag: 'MonitorNotFound' })
      }),
    ),
  )

  it.effect('find returns the stored monitor', () =>
    withDirectory(({ directory }) =>
      Effect.gen(function* () {
        const created = yield* directory.register(definition)

        expect(yield* directory.find(created.id)).toMatchObject({ id: created.id, name: 'Prod API' })
      }),
    ),
  )
})
