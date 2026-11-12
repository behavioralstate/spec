# Versioning

Versions follow the [semver.org](https://semver.org) rules.

**From SPEC.md:** [Versioning](https://github.com/behavioralstate/spec/blob/main/SPEC.md#versioning)

## Release Version

The release version is the git tag — `v{{BEST_VERSION}}`, `v1.0.0`, etc. This is the version implementers and consumers reference in documentation, dependency declarations, and compatibility checks.

The version string (without the `v` prefix) appears at the `/.well-known/best` manifest root, `best.version`: the version of this specification the manifest follows, and the one version a consumer reads.

```json
{
  "best": {
    "version": "{{BEST_VERSION}}",
    "services": { "...": "..." },
    "capabilities": [ "..." ]
  }
}
```

A service or a capability may carry a `version` of its own. No consumer behaviour depends on it, so a server can leave it out, and a consumer accepts a manifest either way.

On a `MAJOR` bump, consumers should review the changelog.

## Namespace Convention

The specification's identifiers take the form `io.best.{service}.{capability}`, such as `io.best.agents.commands`. Implementation-specific capabilities use their own namespace (e.g. `com.example.custom-capability`).
