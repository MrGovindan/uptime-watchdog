import { describe, expect, it } from "@effect/vitest"
import { Duration, Effect, Fiber, Layer, Ref } from "effect"
import { TestClock } from "effect/testing"
import {
  Headers,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"
import { fromInput as headersFromInput } from "effect/unstable/http/Headers"
import { CheckUptime, layer as checkUptimeUseCaseLayer } from "./CheckUptime.ts"

type Handler = (
  request: HttpClientRequest.HttpClientRequest,
) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>

const testClient = (handler: Handler): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => handler(request)),
  )

const respond = (
  request: HttpClientRequest.HttpClientRequest,
  body: string,
  status = 200,
): Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError> =>
  Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status })))

const unreachable = (
  request: HttpClientRequest.HttpClientRequest,
): Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError> =>
  Effect.fail(
    new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        request,
        description: "connection refused",
      }),
    }),
  )

const request = {
  hostname: "example.test",
  port: 8080,
  method: "GET",
  protocol: "https",
  headers: Headers.empty,
} as const

describe(CheckUptime.name, () => {
  it.effect("reports a responding endpoint with its status, body, and duration", () =>
    Effect.gen(function* () {
      // Arrange
      const useCase = yield* CheckUptime

      // Act
      const result = yield* useCase(request)

      // Assert
      expect(result.status).toBe(200)
      expect(result.body).toBe("pong")
      expect(Duration.toMillis(result.duration)).toBe(0)
    }).pipe(
      Effect.provide(checkUptimeUseCaseLayer),
      Effect.provide(testClient((request) => respond(request, "pong"))),
    ),
  )

  it.effect("records a non-2xx status as a successful check", () =>
    Effect.gen(function* () {
      // Arrange
      const useCase = yield* CheckUptime

      // Act
      const result = yield* useCase(request)

      // Assert
      expect(result.status).toBe(503)
      expect(result.body).toBe("maintenance")
    }).pipe(
      Effect.provide(checkUptimeUseCaseLayer),
      Effect.provide(testClient((request) => respond(request, "maintenance", 503))),
    ),
  )

  it.effect("sends a request built from the monitor configuration", () => {
    // Arrange
    const seen = Effect.runSync(
      Ref.make<HttpClientRequest.HttpClientRequest | undefined>(undefined),
    )
    const client = testClient((request) =>
      Ref.set(seen, request).pipe(Effect.as(HttpClientResponse.fromWeb(request, new Response("")))),
    )

    return Effect.gen(function* () {
      const useCase = yield* CheckUptime

      // Act
      yield* useCase({
        ...request,
        method: "POST",
        headers: headersFromInput({ "x-check-token": "secret" }),
      })

      // Assert
      const requestParams = yield* Ref.get(seen)
      expect(requestParams?.method).toBe("POST")
      expect(requestParams?.url).toBe("https://example.test:8080")
      expect(requestParams?.headers["x-check-token"]).toBe("secret")
    }).pipe(Effect.provide(checkUptimeUseCaseLayer), Effect.provide(client))
  })

  it.effect("uses the configured protocol for the request", () => {
    // Arrange
    const seen = Effect.runSync(Ref.make<string | undefined>(undefined))
    const client = testClient((request) =>
      Ref.set(seen, request.url).pipe(
        Effect.as(HttpClientResponse.fromWeb(request, new Response(""))),
      ),
    )

    return Effect.gen(function* () {
      const useCase = yield* CheckUptime

      // Act
      yield* useCase({ ...request, protocol: "http" })

      // Assert
      expect(yield* Ref.get(seen)).toBe("http://example.test:8080")

      // Act
      yield* useCase({ ...request, protocol: "https" })

      // Assert
      expect(yield* Ref.get(seen)).toBe("https://example.test:8080")
    }).pipe(Effect.provide(checkUptimeUseCaseLayer), Effect.provide(client))
  })

  it.effect("returns a slow response with its measured duration once it arrives", () =>
    Effect.gen(function* () {
      // Arrange
      const useCase = yield* CheckUptime

      // Act
      const fiber = yield* useCase(request).pipe(Effect.forkChild)
      yield* TestClock.adjust(Duration.millis(500))
      const result = yield* Fiber.join(fiber)

      // Assert
      expect(result.body).toBe("slow")
      expect(Duration.toMillis(result.duration)).toBe(500)
    }).pipe(
      Effect.provide(checkUptimeUseCaseLayer),
      Effect.provide(
        testClient((request) =>
          Effect.sleep(Duration.millis(500)).pipe(
            Effect.as(HttpClientResponse.fromWeb(request, new Response("slow"))),
          ),
        ),
      ),
    ),
  )

  it.effect("fails with an HttpClientError when the endpoint cannot be reached", () =>
    Effect.gen(function* () {
      // Arrange
      const useCase = yield* CheckUptime

      // Act
      const error = yield* Effect.flip(useCase(request))

      // Assert
      expect(error).toBeInstanceOf(HttpClientError.HttpClientError)
    }).pipe(Effect.provide(checkUptimeUseCaseLayer), Effect.provide(testClient(unreachable))),
  )
})
