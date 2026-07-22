# Versioning

BEST uses **semantic versioning** (`MAJOR.MINOR.PATCH`) following [semver.org](https://semver.org) rules.

## Release Version

The release version is the git tag — `v{{BEST_VERSION}}`, `v1.0.0`, etc. This is the version implementers and consumers reference in documentation, dependency declarations, and compatibility checks.

The version string (without the `v` prefix) appears in:
- The `/.well-known/best` manifest root — `best.version`
- Each service definition — `services["io.best.*"].version`
- Each capability definition — `capabilities[*].version`

```json
{
  "best": {
    "version": "{{BEST_VERSION}}",
    "services": {
      "io.best.agents": { "version": "{{BEST_VERSION}}", "..." : "..." }
    },
    "capabilities": [
      { "name": "io.best.agents.commands", "version": "{{BEST_VERSION}}", "..." : "..." }
    ]
  }
}
```

## Compatibility Rules

| Change type | Bump |
|---|---|
| Breaking changes — field removal, type change, semantic change | `MAJOR` |
| Additive changes — new optional fields, new capabilities | `MINOR` |
| Documentation, clarifications, non-breaking fixes | `PATCH` |

- Consumers must **ignore unknown fields** — forward compatibility
- A `MAJOR` bump signals breaking changes; consumers should review the changelog
- Multiple capabilities can have different versions in the same manifest

## Namespace Convention

All BEST identifiers use reverse domain notation: `io.best.{service}.{capability}`.

Examples:
- `io.best.agents.commands`
- `io.best.agents.events`
- `io.best.agents.queries`

Implementation-specific capabilities use their own namespace (e.g. `com.example.custom-capability`).
