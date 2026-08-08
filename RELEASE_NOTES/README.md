# Release notes

One file per spec release, named after the clean version tag (`v0.9.1.md` for git tag
`spec/v0.9.1`). The file is the body of the GitHub Release.

The CI pipeline creates the GitHub Release automatically when a `spec/v*` tag is pushed,
using the matching file here as the notes. **Write the notes file and commit it to main
before tagging** — the release job checks out the tagged commit, so a notes file added
afterwards is invisible to it (CI falls back to auto-generated commit notes). `release.sh`
refuses to tag without one.

Even a release with no normative changes gets a line — "editorial only, no normative
changes" tells an implementor exactly what they need. An empty release body looks complete
while saying nothing.
