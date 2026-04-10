# Versioning

**Version:** 2026-04-10

## Protocol Version

OAP uses **date-based versioning**: `"2026-04-10"`.

The version appears in:
- The `/.well-known/oap` manifest root
- Each service definition
- Each capability definition

## Namespace Convention

All OAP identifiers use reverse domain notation: `io.oap.{service}.{capability}`.

Examples:
- `io.oap.agents.registry`
- `io.oap.agents.events`
- `io.oap.observability.tracing`

Implementation-specific capabilities use their own namespace (e.g. `com.example.custom-capability`).

## Compatibility Rules

- **Additive changes** (new optional fields, new capabilities) do NOT bump the version
- **Breaking changes** (field removal, type changes, semantic changes) bump the version
- Consumers should **ignore unknown fields** (forward compatibility)
- Multiple versions can coexist in a manifest
