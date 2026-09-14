# AGENTS

## Testing philosophy

Integration tests are the default and preferred form of test. Prefer exercising a
feature end to end through its real seams (HTTP handler + SQLite, for example)
over testing pieces in isolation.

Unit tests are a supplement, not the baseline. Add them only when:

- the module is complex enough that integration coverage is impractical, or
- integration testing would require a combinatorial explosion of cases.

When a contract is defined by `HttpApi` (status codes, response bodies, default
error shapes), integration tests are responsible for locking that contract down.

Commands that merely delegate to a service already covered by other tests do not
need their own tests. When a command does real work (HTTP calls,
encoding/decoding, retries), test its `Effect` directly with a mocked layer for
that service.

## Data, calculations, and actions

Borrow Eric Normand's framing (_Grokking Simplicity_): **data** is inert facts,
**calculations** are pure functions of their inputs, and **actions** depend on
when and where they run (side effects). Foldkit mirrors this. The Model is data,
`update` and `view` are calculations, and Commands and Subscriptions are
actions. Keep the boundaries honest: never perform an action inside a
calculation, and keep data plain. This is also why Commands that only delegate
deserve less test ceremony than Commands that do real work.

## Naming

Prefer singular over plural for resource endpoints and database tables, and keep
endpoints and tables consistent with each other (e.g. `POST /monitor`,
`GET /monitor`, table `monitor`).

### Definition pattern

Name the user-supplied shape of a resource `<Entity>Definition` (e.g.
`MonitorDefinition`, derived from a model's create/update variant). "Definition"
is preferred because it fits both creation and update; avoid role-specific names
like `Create<Entity>Request` or vague ones like `<Entity>Configuration`.

## Single source of truth

Define each fact once and derive everything else from it. Validation rules,
value schemas, limits, and other constants belong to the domain module that owns
the fact; the API, persistence layer, and UI all reuse that one definition. Never
restate a rule (a max length, a trim, a valid set) in a second place so it can
drift: a UI that re-implements a server check will eventually disagree with it.

This applies to derivation too. When a value can only be derived through a
schema, drive the derivation from the schema rather than a parallel hand-rolled
calculation, and export the constant beside the schema when it cannot be
introspected directly.
