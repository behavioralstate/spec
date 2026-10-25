# CLAUDE.md

How this repository is built and shipped is [`SDLC.md`](SDLC.md), the one place the lifecycle is written down; read it
before changing anything, and keep it the current rule when a change moves the process. Repository conventions and
tooling (the layout, version stamping, best-mcp's configuration) are in
[`.github/instructions/general.instructions.md`](.github/instructions/general.instructions.md). In short:

- Starting on an issue, move it to In progress on the Behavioralstate board first (project 4 of Amarcode-Studios, its
  Status field: `gh project item-edit`, or the board itself), and its epic to In progress if it was not; once its
  change is in a release, with only a proof by an implementation or the owner's acceptance left, move it to In review
  (SDLC.md section 1). An issue carries its one epic's label (`best-peer-01`, `windlet-02`), the label the epic
  carries beside `epic`, and no other epic's.
- The spec is stable (SDLC.md section 2's first rule, held on #37). The text changes only on the owner's word, on proof
  that two independent implementations read a sentence differently and a client failed, or that a client could not
  be written from the text. Never add to #37, file a spec-gap issue or draft spec text on your own: bring the proof
  to the owner in the chat and stop. What an implementation does that the spec does not mention is its own, in its
  README. A new `must` says the version it is required from and is listed in `specs/conformance.md`.
- Every change is made on `main` and pushed there, the owner's and every maintainer's; no branch and no pull request
  is needed. The subject is one plain sentence saying what changed and why, with no type prefix (`feat:`, `fix:`);
  the one prefix is `Review:` on a commit that answers the review. A change never edits a version: the release
  scripts do. Open work is an issue on the Behavioralstate board, never a plan file or a `TODO`. `git pull --rebase`
  before the gates; after a rebase that brought commits in, the local gate runs again on the new head, and the review
  runs again when the rebase changed one's own commits (a conflict resolved). A red `main` is fixed before anything
  else is pushed.
- Two gates before every push, both mandatory. First the local proof: `scripts/gate.sh all` (in Git Bash on Windows)
  must end in `GATE GREEN`; CI runs the same script on the push. Then the review: `/spec-review` always runs
  `.claude/skills/spec-reviewer` on a separate worker with the model that skill pins, on what `main` holds that
  `origin/main` does not, and this session fixes every finding on `main`, in a `Review:` commit that names them, or
  sets it aside with its reason in that message (an empty commit when nothing changed). The local gate then runs on
  the head that is pushed. Nothing is pushed until both are done.
- A contributor without write access sends a pull request from a fork; `/spec-review <number>` reviews it the same
  way and posts the findings there. A maintainer merges it once they are answered, the local gate is green on what
  would land, its head squashed onto `main` (run only after its diff has been read, since it runs the contributor's
  code) and CI is green.
- Files keep their own line endings: the repository mixes LF and CRLF per file.
