# How the BEST spec repository is built and shipped

> This is the one place the lifecycle of this repository is written down. It holds the specification (`SPEC.md` and
> `specs/`), its schemas and examples (`protocol/`), the website that renders them, the reference connector
> `best-mcp` (`mcp-server/`) and the validator `best-validate` (`validate-cli/`). Open work of any kind (a spec gap, a
> bug, a decision) is an issue on the Behavioralstate board, never a file.

## 1. Intake

- Work is an issue on the [Behavioralstate board](https://github.com/orgs/Amarcode-Studios/projects/4), with the
  problem, the outcome from the agent's side, numbered decisions, and a "Done when" list. A gap an implementation met
  in the spec is first an entry on the spec follow-ups issue,
  [#37](https://github.com/behavioralstate/spec/issues/37): the entry says what the implementation does and the
  sentence the spec could gain, and the spec change that settles it names the entry.
- Ambiguity is resolved by reading the spec and the implementations that run it, never by guessing.
- The board's Status says where each issue is:
  - **Backlog** until its first change.
  - **In progress** from the first change, before it is made, until its change is in a release: while the work is
    made, and after it is pushed until the release that carries it.
  - **In review** once its change is in a release, when all that is left is a proof by an implementation or the
    owner's acceptance.
  - **Done** when the issue closes, every "Done when" ticked. An issue with nothing to prove or for the owner to
    accept closes when its last change is pushed, and goes from In progress to Done.
  - An epic is **Backlog** until any of its issues is In progress, In review or Done, **In progress** from then
    until it closes, and **Done** when it closes, which is when its last issue does. Ready is not a status an epic
    or an issue holds.
- The board's labels say which epic an issue belongs to, and only that one:
  - An epic carries `epic` and one label of its own, the product's name with a number in the order its epics were
    made (`best-peer-01`, `windlet-01`, `windlet-02`), described as the epic it stands for.
  - Every issue of the epic carries that label, open or closed: an issue filed for the epic's work, next to it, is
    made its sub-issue. No issue carries two epics' labels, and an issue that moves to another epic changes its label
    with its parent.
  - `bug` marks a bug beside its epic's label. `enhancement` is never used, since an issue that is not a bug is an
    enhancement by default.

## 2. Design rules every change is held to

- **The spec follows the implementations.** A rule enters the spec once an implementation proved the need, through
  its entry on #37; the spec does not invent a surface no implementation has asked for. A spec change names the
  entry or issue it settles.
- `SPEC.md` and `specs/` are the source of truth, and nothing of them is copied elsewhere in the repository: the
  website renders them, and every other file links to them. A link from `specs/` to `SPEC.md` is the absolute GitHub
  URL, which the website keeps.
- **A new obligation is dated and listed.** A `must` that an existing service could fail says the version it is
  required from (*Required from x.y.z*), and `specs/conformance.md` lists it, in its section and in the sentence that
  names what that version makes required, so an implementor and the validator find it there.
- Facts are events; an event is versioned, never mutated; a redelivery is idempotent; nothing is clamped silently. A
  refusal says what to send.
- **A schema moves with its examples and its prose.** A change to `protocol/v1/schemas` changes the examples it
  governs and the text that describes it, in the same commit.
- `version.json` is the one version of the protocol; files that show it carry `{{BEST_VERSION}}`, stamped at build
  time. A change never edits a version: the release does.
- **best-mcp stays implementation-agnostic**: no header, path or auth scheme of one service. A credential never
  reaches the model: the connector keeps it, redacts it from what a tool returns, and sends it only to the host it
  was issued for.
- **best-validate checks what the spec says.** A check reports a violation of a rule the spec states; a rule the
  validator does not check yet is an issue, not a silent gap.
- No name of a client's platform appears in the repository: an example uses a made-up service.
- Instructions and this file state the current rule, not its history; the history is in git.

## 3. Build

- Tests first where one applies: best-mcp's and best-validate's smoke tests, against mock services.
- `scripts/gate.sh all` (in Git Bash on Windows) runs every check this repository has and ends in `GATE GREEN` or
  `GATE RED`: the protocol schemas, the example payloads, best-mcp built and its smoke test, best-validate built and
  its smoke test, and the website built from the protocol. CI runs the same script on every push.

## 4. Ship

- **Every change is made on `main` and pushed there.** A maintainer commits on `main`, one commit per piece of work
  (or a few, when they are told apart better that way), the subject saying what changed and why, ending with the
  assistant's attribution line; the one prefix is `Review:` on a commit that answers the review. No branch and no
  pull request is needed; a contributor without write access sends a pull request (section 5).
- **Two gates before every push, in this order, both mandatory; nothing is pushed while one is open.**
  1. **The local proof**: section 3 on the maintainer's machine, `scripts/gate.sh all` ending in `GATE GREEN`; a
     change an implementation must prove (a sign-in, a connector behaviour against a real service) is proven there by
     hand, with the proof on the issue.
  2. **The review**: `/spec-review`, run by the author's assistant on what `main` holds that `origin/main` does not.
     It is the repository's own skill (`.claude/skills/spec-review`, in every checkout), and it always runs the
     `spec-reviewer` skill (`.claude/skills/spec-reviewer`): a reviewer that has not seen the conversation, on a
     separate worker with the model that skill pins (Sonnet 5.5, high effort). The author's session verifies each
     finding and fixes it on `main`, with a test where one applies, in a `Review:` commit whose message names the
     findings, or sets it aside with its reason in that message (an empty commit when no finding changed a file);
     nothing is dropped silently. What a fix changed is reviewed again, and the local gate runs last, on the very
     head that is pushed.
- **Pull first.** The push lands on top of what others pushed: `git pull --rebase` before the gates, and again before
  the push if `origin/main` moved meanwhile. After a rebase that brought commits in, the local gate runs again on the
  new head, whatever they touched; the review runs again when the rebase changed one's own commits (a conflict
  resolved), and stands otherwise.
- **CI runs on the push**: the same script. A red `main` is fixed before anything else is pushed.
- **What GitHub holds `main` to**: no force-push and no deletion. It requires no pull request and no check, since the
  gates run before the push and CI checks the push; that they ran is each maintainer's word.
- **A release is a tag, made by its script**, which runs only on `main` level with `origin/main`, so everything it
  releases has passed the gates.
  - The specification: `scripts/release.sh <version>` writes `version.json`, tags `spec/v<version>` and, for a
    stable release, moves the `BEST@stable` tag to it, the one tag a script moves. CI then creates the GitHub
    release, publishes the website image and opens the pull request that deploys it on the infrastructure
    repository. The notes, `RELEASE_NOTES/v<version>.md`, are written first, in a commit that passes the gates like
    any other.
  - best-mcp: `scripts/release-mcp.sh <version>` tags `mcp/v<version>`, and CI publishes `@behavioralstate/best-mcp`.
  - best-validate: `scripts/release-validate.sh <version>` tags `validate/v<version>`, and CI publishes
    `@behavioralstate/best-validate`.
  - The commits these scripts make hold nothing but the version (and, for the specification, the README's table of
    the documents at that version), and are the ones that skip the gates. A release
    gathers every change since the previous one, and is a patch: the minor or the major goes up only when the owner
    asks for it. A *Required from* version in the spec text dates when an obligation binds; it plans no release.
  - The one exception is the legacy `@behavioralstate/bsp-mcp` 1.x line, kept on a branch cut from `mcp/v1.7.1`
    for deployments still pinned to it: its fixes are committed on that branch and released by a tag made by hand,
    as the README says, since `release-mcp.sh` would publish best-mcp from `main`. That branch predates the gate
    script and the skills: its local proof is the package's own build (`npm run build` in `mcp-server`), and its
    review is the `spec-reviewer` skill run from a checkout of `main` with `branch <name>` as its first argument,
    which reviews what that branch holds that its origin does not; its findings are answered there as on `main`.

## 5. A change from another maintainer, or from a contributor

- **A maintainer works as the owner does**: on `main`, with write access, the two gates before every push, one change
  per need, held to sections 2, 3 and 4 as any change is.
- **A contributor without write access sends a pull request from a fork**, held to the same sections. A maintainer
  runs `/spec-review <number>` on it, which runs the `spec-reviewer` skill the same way, posts the findings on the pull
  request and leaves them for the contributor to answer. Once the findings are answered and the maintainer has read
  the diff, the maintainer runs the local gate on what would land, its head squashed onto the current `main` (it
  builds and runs the contributor's code), and merges it as one commit when that and CI are green, pinned to the head
  that was gated (`gh pr merge --squash --match-head-commit`, the full sha), so a push after the gate cannot land
  without the review and the gate. When `main` moved since the gate, the gate runs again on the new squash before the
  merge. A fork's first workflow run waits for a maintainer's approval on the Actions tab.

## 6. What we do not do

- No push without `GATE GREEN` and the review: `/spec-review` and its `spec-reviewer` run on what is pushed, every
  finding fixed or set aside with its reason; the release scripts' version commits alone skip them.
- No release of a commit the gates have not passed; no tag made by hand, but on the legacy 1.x line (section 4).
- No force-push to `main`; no push on top of a red `main`; no merge of a pull request with an unanswered finding,
  without the local gate green on what would land, or with a red check.
- No plan file, no `TODO`, no dated narrative: open work is an issue.
