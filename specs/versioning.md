# Versioning

OAP uses **semantic versioning** (`MAJOR.MINOR.PATCH`) following [semver.org](https://semver.org) rules.

## Release Version

The release version is the git tag — `v{{OAP_VERSION}}`, `v1.0.0`, etc. This is the version implementers and consumers reference in documentation, dependency declarations, and compatibility checks.

The version string (without the `v` prefix) appears in:
- The `/.well-known/oap` manifest root — `oap.version`
- Each service definition — `services["io.oap.*"].version`
- Each capability definition — `capabilities[*].version`

```json
{
  "oap": {
    "version": "{{OAP_VERSION}}",
    "services": {
      "io.oap.agents": { "version": "{{OAP_VERSION}}", "..." : "..." }
    },
    "capabilities": [
      { "name": "io.oap.agents.commands", "version": "{{OAP_VERSION}}", "..." : "..." }
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

All OAP identifiers use reverse domain notation: `io.oap.{service}.{capability}`.

Examples:
- `io.oap.agents.registry`
- `io.oap.agents.commands`
- `io.oap.agents.events`

Implementation-specific capabilities use their own namespace (e.g. `com.example.custom-capability`).
