# Versioning

BSP uses **semantic versioning** (`MAJOR.MINOR.PATCH`) following [semver.org](https://semver.org) rules.

## Release Version

The release version is the git tag — `v{{BSP_VERSION}}`, `v1.0.0`, etc. This is the version implementers and consumers reference in documentation, dependency declarations, and compatibility checks.

The version string (without the `v` prefix) appears in:
- The `/.well-known/bsp` manifest root — `BSP.version`
- Each service definition — `services["io.bsp.*"].version`
- Each capability definition — `capabilities[*].version`

```json
{
  "BSP": {
    "version": "{{BSP_VERSION}}",
    "services": {
      "io.bsp.agents": { "version": "{{BSP_VERSION}}", "..." : "..." }
    },
    "capabilities": [
      { "name": "io.bsp.agents.commands", "version": "{{BSP_VERSION}}", "..." : "..." }
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

All BSP identifiers use reverse domain notation: `io.bsp.{service}.{capability}`.

Examples:
- `io.bsp.agents.registry`
- `io.bsp.agents.commands`
- `io.bsp.agents.events`

Implementation-specific capabilities use their own namespace (e.g. `com.example.custom-capability`).
