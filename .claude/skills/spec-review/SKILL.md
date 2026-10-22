---
name: spec-review
description: The review gate of the BEST spec repository (SDLC.md section 4, gate 2), mandatory before every push to main. With no argument it reviews what the local main holds that origin/main does not; with a number, a contributor's pull request. Always gets the findings from the `spec-reviewer` skill, which runs with an empty context on the model it pins. For main, this session verifies each finding, fixes the real ones on main with a test in a `Review:` commit, runs the local gate again, and reports; for a pull request, it posts the findings as a comment-only review for the contributor to answer. Use before any push to main, when asked to review the work, to run the review gate, or to review a contributor's pull request; `/spec-review` is how a maintainer types it.
argument-hint: "[pull-request number]"
effort: high
---

# Review

The review gate of the BEST spec repository, mandatory before every push to `main` (SDLC.md section 4). The findings always come
from the `spec-reviewer` skill: a reviewer that has not seen this conversation, on the model it pins. This session
verifies, fixes and answers them. Nothing here pushes, approves or merges: the push follows once the gate is passed,
and a contributor's pull request is merged by a maintainer once its findings are answered, the local gate is green
on what would land and CI is green.

`$ARGUMENTS` empty: review `main` (section A). A number: review that pull request (section B).

## A. Before a push: what `main` holds that `origin/main` does not

### 1. What is to be pushed

```bash
git fetch origin && git status --short --branch
git log --oneline origin/main..main
```

- On another branch than `main`, or with uncommitted changes: say what differs in one line and stop. Never switch
  branches, stash or discard anything.
- `main` behind `origin/main`: `git pull --rebase` first (SDLC.md section 4). Step 6's gate then runs on the new
  head whatever arrived; if the rebase changed one's own commits (a conflict resolved), review them again.
- Nothing ahead of `origin/main`: say so in one line and stop.
- Findings of a previous run on these commits: those named in the messages of `Review:` commits ahead of
  `origin/main`. Pass them along so the reviewer does not repeat them.

### 2. The findings

Invoke the `spec-reviewer` skill with `main` as the first word of its arguments and, after it, the already-reported
findings if any. It forks on its own model and returns a `FINDINGS` block with every finding it has; the block is
never truncated, so what it returns is the whole review. If the Skill tool cannot run it, spawn one Agent
(general-purpose) with `model: "sonnet"` (the Agent tool takes aliases, and the alias is what pins it on this path)
and `effort: "high"`, whose prompt is the body of `.claude/skills/spec-reviewer/SKILL.md` with the arguments filled
in; never review in this session's own context, which wrote the code.

### 3. Verify, fix, prove

For every finding, in order:

1. **Verify** it against the code yourself. A finding you cannot reproduce from the code is set aside, with the
   reason, not fixed.
2. **Fix** a real defect on `main`: in best-mcp or best-validate, a smoke test that fails without the fix where one
   applies, then the fix, matching the surrounding code and comments; in the spec, the text, schema or example made
   right with everything that states the same rule. A finding that reveals a design error, or a rule that does
   not pass SDLC.md section 2's bar (no interop failure between two implementations and no client that cannot be
   written from the text, whatever its entry on #37 says), is not patched: say so in the chat and stop before the
   push; that goes back to the issue, where it closes as the implementation's own or waits for a second one.
3. **The local gate** after the fixes, as SDLC.md section 4 gate 1 asks: `scripts/gate.sh all` (in Git Bash on
   Windows) must end in `GATE GREEN`. A red gate is reported as red, with the step that failed.
4. **Commit** once for all the fixes (or once per finding when they are unrelated), the subject one plain sentence
   saying what changed and why, starting `Review:`, the body naming every finding and what became of it (fixed, or
   set aside and why), ending with the attribution line this session uses. When no finding changed a file, the
   commit is empty (`git commit --allow-empty`), so what was set aside is still on record and a later run does not
   report it again. Line endings as they were (`git diff --stat --ignore-cr-at-eol` shows no whole-file churn).
5. **Review the fixes**: when step 4 changed code, run this section again on what is new, passing the findings
   already answered, until a run reports nothing new.
6. **The local gate on the head that is pushed**, always, last, whether or not a finding changed anything:
   `scripts/gate.sh all` (in Git Bash on Windows). The report says GREEN only from that run's own
   `GATE GREEN` line, on `git rev-parse --short HEAD`.

### 4. Report

In chat, one block and nothing longer, then stop: the push is the maintainer's next step, once the gate is passed.

```
**main** (<n> commits ahead of origin/main)
- fixed: <the defect in half a sentence> (<sha>)
- set aside: <the finding> — <why>
- owner's call: <what needs a decision>
gate: GREEN on <sha> (step 6's own run); ready to push
   | RED (<the step that failed>) on <sha>; not ready to push
```

`no findings` when the reviewer reported none.

## B. A contributor's pull request

### 1. The pull request

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
gh pr view $ARGUMENTS --json number,url,state,isDraft,baseRefName,headRefName,headRefOid,author
```

- Not open: say so in one line and stop.
- Fetch its head without switching anything, forced, since a contributor may have rewritten it:
  `git fetch origin +refs/pull/<n>/head:refs/review/pr-<n>`. The reviewer reads it there
  (`git show refs/review/pr-<n>:<path>`, `git diff origin/main...refs/review/pr-<n>`). Nothing of it runs yet.
- Findings already on the pull request from a previous run: the inline comments AND the review bodies that start with
  `**spec-review**` (a finding on an unchanged line lives in a body, not inline). Collect path, line and summary from
  both so the reviewer is told not to repeat them.

```bash
gh api repos/<owner/repo>/pulls/<n>/comments --paginate --jq '.[] | select(.body | startswith("**spec-review**")) | {id, path, line, body}'
gh api repos/<owner/repo>/pulls/<n>/reviews --paginate --jq '.[] | select(.body | startswith("**spec-review**")) | {id, body}'
```

### 2. The findings

As in section A, step 2, with the pull request number as the first word of the reviewer's arguments; tell it the
head is fetched at `refs/review/pr-<n>`.

### 3. Post the review, comment only

Build one review from the block and post it, so the contributor has every finding where they answer it:

```bash
gh api repos/<owner/repo>/pulls/<n>/reviews --input <scratch dir>/review.json
```

`review.json` is written in the session's scratchpad directory (or the system temp directory), never inside the
checkout:

```json
{
  "event": "COMMENT",
  "body": "**spec-review** on <head sha, all 40 characters, of refs/review/pr-<n> as reviewed>: <n> defects, <m> questions. Findings on unchanged lines are listed here; the rest are inline.\n\n<one bullet per finding with line 0: path, summary, failure>",
  "comments": [
    { "path": "<path>", "line": <line>, "side": "RIGHT",
      "body": "**spec-review** <defect|question>: <summary>\n\nFailure: <failure>\nFix: <fix>" }
  ]
}
```

Before posting, check every inline comment's `path` and `line` against the hunks of `gh pr diff <n>`: a line that is
not on the new side of the diff goes into the body as a line-0 finding instead, because GitHub rejects the whole
review (422) for one bad anchor. If the post is still rejected, move the comment it names into the body and post
again; no finding is dropped. `FINDINGS none` posts a review with the body `**spec-review** on <the full sha>: no findings.`
and no comments. The event is always `COMMENT`; never `APPROVE` or `REQUEST_CHANGES`.

The fixes are the contributor's, on their branch. A later push of theirs is reviewed again by the same command, and
that run reviews only what is new, because step 1 passes the reported findings along.

### 4. The local gate on what would land, before a merge

Only once every finding is answered and the maintainer has read the diff, since the gate builds and runs the
contributor's code on this machine. The gate runs on what would land, the pull request squashed onto the current
`main`. First `git fetch origin +refs/pull/<n>/head:refs/review/pr-<n>` again and compare
`git rev-parse refs/review/pr-<n>`, all 40 characters, with the head the review ran on (the full sha of its
`**spec-review** on <sha>`; never a shortened one, which a contributor could match with other code): when they differ
the contributor pushed since, so stop and go back to step 1, since the new commits are reviewed before they are
gated. Then `git fetch origin`,
`git worktree remove --force <scratch>/pr-<n>` for a leftover one, then
`git worktree add --detach <scratch>/pr-<n> origin/main`, noting `git -C <scratch>/pr-<n> rev-parse HEAD`, the
`main` the squash is made on, which the report shows and the merge checks; and, in it, `git merge --squash refs/review/pr-<n>` (a
conflict is the contributor's to resolve, so it is reported and the gate does not run), then `scripts/gate.sh all`
(in Git Bash on Windows), and the worktree removed (`git worktree remove --force <scratch>/pr-<n>`, since the squash leaves it staged). Until then the report says the gate has not run.

### 5. Report

In chat, one block and nothing longer:

```
**<owner/repo>#<n>** <pull request url>
- defect: <the defect in half a sentence>
- question: <the question>
- owner's call: <what needs a decision>
posted: <review url>
gate on what would land: GREEN | RED (<the step>) on <head sha> squashed onto <origin/main sha> | not run yet (findings open)
```

`no findings` when the reviewer reported none. Approve nothing; merge nothing: a maintainer merges once every finding
is answered, the local gate is green on what would land, and CI is green, pinned to the head that was gated so a push
after the gate cannot land unseen: `gh pr merge <n> --squash --match-head-commit <the full sha of refs/review/pr-<n>>`.
Just before it, `git fetch origin` and compare `origin/main` with the sha the gate's squash was made on: when `main`
moved since, what would land is not what was gated, so step 4 runs again first.
