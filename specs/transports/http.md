# HTTP Transport

HTTP is the primary transport for web-based consumers including the BEST web UI. The HTTP API surface is fully described by the capability `endpoints` arrays in the discovery manifest — no separate OpenAPI document is required from implementers.

**From SPEC.md:** [HTTP Transport](https://github.com/behavioralstate/spec/blob/main/SPEC.md#http-transport)

## Behind a proxy

If the implementer routes traffic internally, `http.endpoint` is the _outermost_ address consumers hit: the public or proxy address.

For a tenant's address, see [Multi-Tenancy](../discovery.md#multi-tenancy).

## Sending credentials

For `oauth2`, obtain a token from `authentication.tokenUrl`, then send `Authorization: Bearer <token>`. An `apiKey` in a query parameter carries short-lived exchanged tokens only, never long-lived keys.

The security schemes are formally declared in the OpenAPI `securitySchemes` component. The constraints on the exchange are in [Security — Token Exchange and Query-String Credentials](../security.md#token-exchange-and-query-string-credentials).

## OpenAPI Specs

- [Agent Service OpenAPI](../../protocol/v1/services/agents/openapi.json)
