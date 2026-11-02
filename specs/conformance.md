# Conformance

**From SPEC.md:** [Conformance](https://github.com/behavioralstate/spec/blob/main/SPEC.md#conformance)

## Why the root manifest's rules matter for agents

An AI agent hitting a root manifest that has an empty `capabilities` array but no `tenants.manifest` cannot proceed — it has no signal for what to do next. A root manifest that follows the [Multi-Tenancy rules](https://github.com/behavioralstate/spec/blob/main/SPEC.md#multi-tenancy) gives any agent unambiguous guidance: check capabilities → if absent, check tenants.manifest → ask user for tenant ID → fetch tenant manifest.
