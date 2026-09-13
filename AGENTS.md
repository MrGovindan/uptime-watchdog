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

## Naming

Prefer singular over plural for resource endpoints and database tables, and keep
endpoints and tables consistent with each other (e.g. `POST /monitor`,
`GET /monitor`, table `monitor`).

### Definition pattern

Name the user-supplied shape of a resource `<Entity>Definition` (e.g.
`MonitorDefinition`, derived from a model's create/update variant). "Definition"
is preferred because it fits both creation and update; avoid role-specific names
like `Create<Entity>Request` or vague ones like `<Entity>Configuration`.
