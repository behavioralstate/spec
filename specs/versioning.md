# Versioning

BEST uses **semantic versioning** following [semver.org](https://semver.org) rules.

**From SPEC.md:** [Versioning](https://github.com/behavioralstate/spec/blob/main/SPEC.md#versioning)

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

A `MAJOR` bump signals breaking changes; consumers should review the changelog.

## Namespace Convention

All BEST identifiers follow `io.best.{service}.{capability}`, such as `io.best.agents.commands`. Implementation-specific capabilities use their own namespace (e.g. `com.example.custom-capability`).
