import { BunHttpServer } from '@effect/platform-bun'
import {
  type MonitorObservation,
  Monitor,
  MonitorId,
  WatchdogEvent,
  WatchdogRpcs,
} from '@uptime-watchdog/common'
import { describe, expect, it } from '@effect/vitest'
import { DateTime, Duration, Effect, Layer, Queue, Result, Schema, Scope, Stream } from 'effect'
import { HttpRouter } from 'effect/unstable/http'
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc'
import { Socket } from 'effect/unstable/socket'

import * as MonitorApi from './MonitorApi'
import { cronConversionStub, definitionJson, mattermostStub, shareDependencies } from './testing'
import * as WatchdogRpc from './WatchdogRpc'

const updateJson = { ...definitionJson, name: 'Renamed API' }

const withServer = (
  run: (
    port: number,
    observationQueue: Queue.Queue<MonitorObservation>,
  ) => Effect.Effect<void, never, Scope.Scope>,
) => {
  const port = 40000 + Math.floor(Math.random() * 20000)
  const { observationQueue, events, monitors, targets, health } = shareDependencies()

  const server = HttpRouter.serve(Layer.mergeAll(MonitorApi.layer, WatchdogRpc.layer)).pipe(
    Layer.provide(
      Layer.mergeAll(events, monitors, targets, health, mattermostStub(), cronConversionStub()),
    ),
    Layer.provide(BunHttpServer.layer({ hostname: '127.0.0.1', port })),
  )

  // The client protocol is scoped to the test body, so close it before the
  // server layer shuts down; otherwise server.stop() waits on the open socket.
  return Effect.scoped(run(port, observationQueue)).pipe(Effect.provide(server))
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

const listMonitorsViaHttp = (port: number) =>
  Effect.gen(function* () {
    const response = yield* request(port, '/monitor')
    expect(response.status).toBe(200)
    return (yield* Effect.promise(() => response.json())) as Array<{
      monitor: unknown
      health: { _tag: string }
    }>
  })

const observationFor = (
  port: number,
  monitorId: MonitorId,
  status: number,
): Effect.Effect<MonitorObservation> =>
  listMonitorsViaHttp(port).pipe(
    Effect.flatMap((monitors) =>
      Schema.decodeUnknownEffect(Monitor.json)(
        monitors.find((entry) => (entry.monitor as { id: string }).id === monitorId)!.monitor,
      ),
    ),
    // The events socket encodes `Monitor` in its persistence form, where `request`
    // is a JSON string. Rebuild the monitor in that shape so it can be published.
    Effect.flatMap((monitor) =>
      Schema.encodeUnknownEffect(Monitor.json)(monitor).pipe(
        Effect.flatMap((wire) =>
          Schema.decodeUnknownEffect(Monitor)({ ...wire, request: JSON.stringify(wire.request) }),
        ),
      ),
    ),
    Effect.map((monitor) => ({
      monitor,
      observation: {
        time: DateTime.nowUnsafe(),
        response: Result.succeed({ duration: Duration.millis(5), status, body: 'pong' }),
      },
    })),
    Effect.orDie,
  )

// The RPC client protocol forks a background socket reader into the scope that
// runs `makeProtocolSocket`, so the protocol must be constructed in the test's
// own scope. Building it in a layer provided only around `RpcClient.make` closes
// that scope when `make` returns, silently interrupting the reader before the
// socket ever dials.
const connect = (port: number) =>
  Effect.gen(function* () {
    const socket = yield* Socket.makeWebSocket(`ws://127.0.0.1:${port}/rpc`).pipe(
      Effect.provide(Socket.layerWebSocketConstructorGlobal),
    )
    const protocol = yield* RpcClient.makeProtocolSocket().pipe(
      Effect.provideService(Socket.Socket, socket),
      Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
    )

    return yield* RpcClient.make(WatchdogRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, protocol),
    )
  })

const subscribe = (port: number) =>
  Effect.gen(function* () {
    const client = yield* connect(port)
    const received = yield* Queue.unbounded<WatchdogEvent>()

    yield* Effect.forkScoped(
      client
        .events()
        .pipe(Stream.runForEach((event) => Queue.offer(received, event).pipe(Effect.asVoid))),
    )

    // The bus is deltas-only, so events published before the server processes
    // the subscription request are lost. Wait for the handshake to settle.
    yield* Effect.sleep('250 millis')

    return received
  })

const nextEvent = (received: Queue.Queue<WatchdogEvent>): Effect.Effect<WatchdogEvent> =>
  Queue.take(received).pipe(Effect.timeout('5 seconds'), Effect.orDie)

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
          expect(yield* nextEvent(received)).toMatchObject({
            _tag: 'MonitorUpdated',
            monitor: { id: monitorId, name: 'Renamed API' },
          })

          yield* deleteViaHttp(port, monitorId)
          expect(yield* nextEvent(received)).toMatchObject({
            _tag: 'MonitorDeleted',
            monitor: { id: monitorId },
          })
        }),
      ),
    15000,
  )

  it.live(
    'pushes health transitions derived from observations',
    () =>
      withServer((port, observations) =>
        Effect.gen(function* () {
          const received = yield* subscribe(port)

          const monitorId = yield* registerViaHttp(port)
          yield* nextEvent(received)

          yield* Queue.offer(
            observations,
            yield* observationFor(port, MonitorId.make(monitorId), 200),
          )
          expect(yield* nextEvent(received)).toMatchObject({
            _tag: 'MonitorHealthy',
            monitor: { id: monitorId },
            health: { _tag: 'Healthy', response: { status: 200 } },
          })

          yield* Queue.offer(
            observations,
            yield* observationFor(port, MonitorId.make(monitorId), 503),
          )
          expect(yield* nextEvent(received)).toMatchObject({
            _tag: 'MonitorDegraded',
            monitor: { id: monitorId },
            health: {
              _tag: 'Degraded',
              reason: { _tag: 'Unexpected', response: { status: 503 } },
            },
          })

          yield* Queue.offer(
            observations,
            yield* observationFor(port, MonitorId.make(monitorId), 200),
          )
          expect(yield* nextEvent(received)).toMatchObject({
            _tag: 'MonitorHealed',
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
