# HTTP Transport

HTTP is the primary transport for web-based consumers including the BEST web UI. The HTTP API surface is fully described by the capability `endpoints` arrays in the discovery manifest — no separate OpenAPI document is required from implementers.

**From SPEC.md:** [HTTP Transport](https://github.com/behavioralstate/spec/blob/main/SPEC.md#http-transport)

## Behind a proxy

If the implementer routes traffic internally, `http.endpoint` is the _outermost_ address consumers hit: the public or proxy address.

For a tenant's address, see [Multi-Tenancy](../discovery.md#multi-tenancy).

## Sending credentials

| Type | How to send |
|---|---|
| `bearer` | `Authorization: Bearer <token>` header |
| `apiKey` (header) | Custom header named in `authentication.scheme` |
| `apiKey` (query) | Query parameter named in `authentication.scheme` — short-lived exchanged tokens only, never long-lived keys |
| `oauth2` | Obtain a token from `authentication.tokenUrl`, then `Authorization: Bearer <token>` |
| `none` | No credentials required |

The security schemes are formally declared in the OpenAPI `securitySchemes` component. The constraints on the exchange are in [Security — Token Exchange and Query-String Credentials](../security.md#token-exchange-and-query-string-credentials).

## OpenAPI Specs

- [Agent Service OpenAPI](../../protocol/v1/services/agents/openapi.json)
