import { BunHttpServer } from '@effect/platform-bun'
import { type WatchdogEvent, WatchdogRpcs } from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Queue, Ref, Scope, Stream } from 'effect'
import { HttpRouter } from 'effect/http'
import { RpcClient, RpcSerialization } from 'effect/rpc'
import { Socket } from 'effect/socket'

import type { Interface as CheckUptimeInterface } from './CheckUptime'
import { definitionJson, observation, watchdogLayer } from './testing'

const updateJson = { ...definitionJson, name: 'Renamed API' }

const withServer = (run: (port: number, status: Ref.Ref<number>) => Effect.Effect<void, never, Scope.Scope>) => {
  const port = 40000 + Math.floor(Math.random() * 20000)
  const status = Effect.runSync(Ref.make(200))
  const checkUptime: CheckUptimeInterface = () => Ref.get(status).pipe(Effect.map(observation))

  const server = HttpRouter.serve(watchdogLayer({ checkUptime })).pipe(
    Layer.provide(BunHttpServer.layer({ hostname: '127.0.0.1', port })),
  )

  // The client protocol is scoped to the test body, so close it before the
  // server layer shuts down; otherwise server.stop() waits on the open socket.
  return Effect.scoped(run(port, status)).pipe(Effect.provide(server))
}

const request = (port: number, path: string, init?: RequestInit) =>
  Effect.promise(() => fetch(`http://127.0.0.1:${port}${path}`, init))

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const registerViaHttp = (port: number): Effect.Effect<string> =>
  Effect.gen(function* () {
    const response = yield* request(port, '/monitor', json(definitionJson))
    expect(response.status).toBe(201)

    const created = (yield* Effect.promise(() => response.json())) as { id: string }
    return created.id
  })

const updateViaHttp = (port: number, monitorId: string) =>
  Effect.gen(function* () {
    const response = yield* request(port, `/monitor/${monitorId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updateJson),
    })
    expect(response.status).toBe(200)
  })

const deleteViaHttp = (port: number, monitorId: string) =>
  Effect.gen(function* () {
    const response = yield* request(port, `/monitor/${monitorId}`, { method: 'DELETE' })
    expect(response.status).toBe(204)
  })

const checkViaHttp = (port: number, monitorId: string) =>
  Effect.gen(function* () {
    const response = yield* request(port, `/monitor/${monitorId}/check`, { method: 'POST' })
    expect(response.status).toBe(200)
  })

const isHealthEvent = (event: WatchdogEvent): boolean =>
  event._tag === 'MonitorHealthy' || event._tag === 'MonitorDegraded'

// Registers a stream, so each lifecycle event is followed by an immediate
// health snapshot; `nextEvent` filters to whichever events a test cares about.
const nextEvent = (
  received: Queue.Queue<WatchdogEvent>,
  predicate: (event: WatchdogEvent) => boolean = () => true,
): Effect.Effect<WatchdogEvent> =>
  Queue.take(received).pipe(
    Effect.flatMap((event) => (predicate(event) ? Effect.succeed(event) : nextEvent(received, predicate))),
    Effect.timeout('5 seconds'),
    Effect.orDie,
  )

const nextLifecycleEvent = (received: Queue.Queue<WatchdogEvent>) =>
  nextEvent(received, (event) => !isHealthEvent(event))

const nextHealthEvent = (received: Queue.Queue<WatchdogEvent>) => nextEvent(received, isHealthEvent)

const connect = (port: number) =>
  Effect.gen(function* () {
    const socket = yield* Socket.makeWebSocket(`ws://127.0.0.1:${port}/rpc`).pipe(
      Effect.provide(Socket.layerWebSocketConstructorGlobal),
    )
    const protocol = yield* RpcClient.makeProtocolSocket().pipe(
      Effect.provideService(Socket.Socket, socket),
      Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
    )

    return yield* RpcClient.make(WatchdogRpcs).pipe(Effect.provideService(RpcClient.Protocol, protocol))
  })

const subscribe = (port: number) =>
  Effect.gen(function* () {
    const client = yield* connect(port)
    const received = yield* Queue.unbounded<WatchdogEvent>()

    yield* Effect.forkScoped(
      client.events().pipe(Stream.runForEach((event) => Queue.offer(received, event).pipe(Effect.asVoid))),
    )

    // The bus is deltas-only, so events published before the server processes
    // the subscription request are lost. Wait for the handshake to settle.
    yield* Effect.sleep('250 millis')

    return received
  })

describe('watchdog events websocket', () => {
  it.live(
    'pushes monitor CRUD events to a connected client',
    () =>
      withServer((port) =>
        Effect.gen(function* () {
          const received = yield* subscribe(port)

          const monitorId = yield* registerViaHttp(port)
          expect(yield* nextEvent(received)).toMatchObject({
            _tag: 'MonitorRegistered',
            monitor: { id: monitorId, name: 'Prod API' },
          })

          yield* updateViaHttp(port, monitorId)
          expect(yield* nextLifecycleEvent(received)).toMatchObject({
            _tag: 'MonitorUpdated',
            monitor: { id: monitorId, name: 'Renamed API' },
          })

          yield* deleteViaHttp(port, monitorId)
          expect(yield* nextLifecycleEvent(received)).toMatchObject({
            _tag: 'MonitorDeleted',
            monitor: { id: monitorId },
          })
        }),
      ),
    15000,
  )

  it.live(
    'pushes a health snapshot for each observation',
    () =>
      withServer((port, status) =>
        Effect.gen(function* () {
          const received = yield* subscribe(port)

          const monitorId = yield* registerViaHttp(port)
          yield* nextEvent(received)
          yield* nextHealthEvent(received)

          yield* Ref.set(status, 503)
          yield* checkViaHttp(port, monitorId)
          expect(yield* nextHealthEvent(received)).toMatchObject({
            _tag: 'MonitorDegraded',
            monitor: { id: monitorId },
            health: {
              _tag: 'Degraded',
              reason: { _tag: 'Unexpected', response: { status: 503 } },
            },
          })

          yield* Ref.set(status, 200)
          yield* checkViaHttp(port, monitorId)
          expect(yield* nextHealthEvent(received)).toMatchObject({
            _tag: 'MonitorHealthy',
            monitor: { id: monitorId },
            health: { _tag: 'Healthy', response: { status: 200 } },
          })
        }),
      ),
    15000,
  )

  it.live(
    'broadcasts each event to every connected client',
    () =>
      withServer((port) =>
        Effect.gen(function* () {
          const first = yield* subscribe(port)
          const second = yield* subscribe(port)

          const monitorId = yield* registerViaHttp(port)

          expect(yield* nextEvent(first)).toMatchObject({
            _tag: 'MonitorRegistered',
            monitor: { id: monitorId },
          })
          expect(yield* nextEvent(second)).toMatchObject({
            _tag: 'MonitorRegistered',
            monitor: { id: monitorId },
          })
        }),
      ),
    15000,
  )
})
