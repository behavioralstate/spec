# Identity and Agent Registration

*A described pattern — non-normative, except where it points at [SPEC.md — Agent Registration](https://github.com/behavioralstate/spec/blob/main/SPEC.md#agent-registration), which is. A service that needs no authentication can ignore this page.*

BEST defines no identity provider, no account model and no login, exactly as it defines no registry. A platform that has them keeps them. What every platform with accounts has to get right is the first five minutes: a person says "sign me in to example.com" to an agent that has never heard of the service, and a few moments later the agent is working in that person's account. This page gives that moment one vocabulary and one flow, so that implementers do not invent either under pressure.

---

## The flow is one

Whatever the person said — "sign me in", "sign me up", "connect me" — and whether or not they have an account, the same thing happens:

1. The agent registers itself and gives the person **a link and a short code**.
2. The link opens **a page of the platform**. There the person signs in — or signs up, where the platform offers that — and approves the agent.
3. The agent collects its credential.

The agent never needs to work out from the person's words whether an account exists. Whether a person without one can get one is the page's business: a self-serve platform offers sign-up there; a platform whose accounts are provisioned offers sign-in only, and its approver may be an administrator rather than the person. The agent's side is identical in both.

## Whose act is whose

| Behaviour | Whose | Where it happens |
|---|---|---|
| **Register agent** | the agent's | the device authorization request — not a BEST command |
| **Sign in** | the person's | the platform's own page, reached from the link the agent shows |
| **Sign up** *(where offered)* | the person's | the same page; it is also where the account is opened |
| **Approve agent** | the approver's | the same page, once signed in |
| **Revoke agent** | the agent's, or the approver's | a command under that credential; or the platform's UI |
| **Sign out** | the person's | the platform's own UI; it ends the person's browser session and touches no agent credential |

Signing in, up and out belong to the **person** and happen on the platform's pages, with its identity provider. The agent never sees a password, never performs or simulates them, and **no BEST operation or workflow is named after them**. Registering and revoking belong to the **agent** and are named as such.

The two confusions this table exists to prevent:

- A recipe called "sign in" whose steps register an agent. When the person says "sign me in" they are saying what they want; what the agent *does* is register.
- An operation called "sign out" that revokes a key. Ending the person's session leaves every agent credential alive; revoking a credential leaves the person's session alive. An operation that revokes a key is a revocation.

## The exchange

Registration is [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628) — the OAuth 2.0 Device Authorization Grant — unchanged. The manifest declares the two endpoints:

```json
"authentication": {
  "type": "apiKey", "scheme": "X-Api-Key", "in": "header",
  "deviceAuthorizationUrl": "https://api.example.com/auth/device",
  "tokenUrl": "https://api.example.com/auth/token"
}
```

**The agent asks** — no credential, form-encoded:

```
POST /auth/device
Content-Type: application/x-www-form-urlencoded

client_id=best-mcp&agent_label=Claude%20on%20Ada%27s%20laptop
```

**The service answers at once:**

```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://example.com/activate",
  "verification_uri_complete": "https://example.com/activate?code=WDJB-MJHT",
  "expires_in": 900,
  "interval": 5,
  "note": "Give the person this link, verification_uri_complete (or verification_uri and user_code), to open in their own browser, where they sign in and approve you. Never open it yourself or in a browser you control: approving is theirs. Then poll tokenUrl no faster than interval, with a form of grant_type=urn:ietf:params:oauth:grant-type:device_code, device_code and client_id. Its answer carries a secret credential: save it straight to your client's credential store or to a file only the person can read, without printing it, and never put it in a message or a command."
}
```

**The agent gives the person the link and the code before anything else**, to open in their own browser — it never opens the link itself — then polls:

```
POST /auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
```

While the person has not acted: `400 { "error": "authorization_pending" }` — not an error; wait `interval` seconds and ask again. `slow_down` means wait longer. `access_denied` and `expired_token` end the registration.

**On approval:**

```json
{
  "access_token": "…",
  "token_type": "apikey",
  "auth_header": "X-Api-Key",
  "tenant_id": "acme"
}
```

`tenant_id` and `auth_header` are the two members BEST adds to the RFC 6749 token response: the account the credential opens, and the header that carries it. With them the agent expands `tenants.manifest`, fetches the account's manifest and is at work. It never asked the person for a key or a tenant ID.

## Why not a BEST command

It is tempting to model registration as a command on a public surface — `request-registration`, then a query to poll, then a claim. It does not work, for one reason: **a command has no synchronous answer**. The service cannot hand an anonymous caller anything at the moment it asks, so the only tie between the caller and its registration is an identifier the caller chose — and that identifier ends up being accepted as the secret when the credential is claimed.

Two things are wrong with that. An identifier is logged, projected and indexed by design; whoever can read those can claim the credential between approval and claim. And when the caller is a model, the "random" identifier is minted by something that cannot produce randomness: models repeat the example values they have seen. RFC 8628's first step is synchronous and its secret is generated by the service, which removes both problems. Hence the rule in the Security Requirements: **identifiers are not secrets**, and every secret a service relies on is generated by the service.

## Where the credential lives

Only the consumer knows what it can keep secret, so the consumer says so.

- **A client with its own store** — the reference MCP server is one — makes the token request itself, keeps the credential where the model never sees it, redacts it from everything it returns to the model, and has it again at every later start. The person registers once.
- **An agent with no such client** — a model in a chat making HTTP requests — has nowhere to put a secret but the conversation, and a conversation is kept, synced, summarised and shared. It registers with `credential_lifetime=session`. The approval page tells the person what is being granted ("until you revoke it", or "for eight hours"), and what the agent receives is short-lived (`expires_in`), so the next conversation starts with a new link and code rather than with a key left in an old one.

`credential_lifetime` only ever lowers what is issued, so an agent gains nothing by misstating it.

At each step the service speaks to the agent in the words of the [sign-in guidance](https://github.com/behavioralstate/spec/blob/main/SPEC.md#sign-in-guidance): the manifest's `authentication.note`, the device answer's `note`, and the start of the token answer's `note`. Making a connection last is the consumer's decision, and the token answer is where the service equips it: the [credential block](https://github.com/behavioralstate/spec/blob/main/SPEC.md#agent-registration) says the credential is a secret that is never repeated in the conversation, and offers both ways to use it — an MCP client's configuration (`mcp`) and direct calls (`http`). A recipe still says nothing about the consumer's client ([Manifest Discipline](https://github.com/behavioralstate/spec/blob/main/SPEC.md#manifest-discipline) rule 5): the credential, and so the choice, only exists in the token answer.

## Revoking

Revoke agent is an ordinary command on the account's surface, sent under the credential being revoked (and, on most platforms, a button in the account's UI). After it, that credential receives `401`; the way back is the one the manifest declares — register again.

## Optional: an agent that opens accounts

Nothing above depends on it, but a platform **may** let an agent open an account itself. That is an ordinary command, and because it commits the person — terms accepted, personal data created, perhaps billing started — it carries the [`impact` annotation](agents/commands.md#high-impact-annotations-impact) with `categories: ["commitment"]` and `confirmation: "required"`: the agent tells the person what they are agreeing to and gets a yes before it sends anything.

## One backend, two kinds of person

A common shape: customers sign in on `app.example.com` and approve agents for their own account, while the operator's staff sign in on `backoffice.example.com` — another identity provider — and approve agents for the accounts they administer. The two identities never join, the customer surface never mentions the back office, and both sit on one BEST API.

BEST needs nothing new for it. A service is named by a domain ([Name Resolution](https://github.com/behavioralstate/spec/blob/main/SPEC.md#name-resolution)), so this is **two names and two manifests**:

- **Each host serves its own `/.well-known/best`.** `app.example.com/.well-known/best` and `backoffice.example.com/.well-known/best` are two root manifests. The backend chooses which door it is answering by the request's host, never by a path prefix: a consumer resolves a name at the host's well-known path and looks nowhere else.
- **Each door has its own registration.** Its `deviceAuthorizationUrl` and `tokenUrl` are on its own host, and the `verification_uri` it answers is that door's own approval page. A person approves where they sign in.
- **The door is stamped on the registration** when it opens, so one host's approval page refuses a code issued by the other.
- **The consumer keeps them apart by name.** A credential is bound to the name it was issued under, and is only ever sent to that name's canonical host. A client holding both — a person who is also staff — holds two credentials under two names, and neither is ever used for the other.

## See also

- [SPEC.md — Agent Registration](https://github.com/behavioralstate/spec/blob/main/SPEC.md#agent-registration) — the normative exchange
- [Security — Identifiers are not secrets](security.md#identifiers-are-not-secrets) and [Credentials stay out of transcripts](security.md#credentials-stay-out-of-transcripts)
- [Discovery — Name Resolution](discovery.md#name-resolution) — how the agent got from "example.com" to the manifest in the first place
