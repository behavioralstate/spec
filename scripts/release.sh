#!/usr/bin/env bash
set -euo pipefail

# OAP Release Script
# Usage: ./scripts/release.sh <version> [--prerelease] [--protocol-version <YYYY-MM-DD>]
#
# --protocol-version  Date string to stamp into all spec files as the OAP protocol version.
#                     Defaults to today's date (YYYY-MM-DD).
#                     This updates every "version": "YYYY-MM-DD" field in JSON examples
#                     and OpenAPI specs.
#                     It does NOT touch example timestamps (CloudEvent "time", "startedAt",
#                     "completedAt" fields) — those are illustrative and left unchanged.
#
# Examples:
#   ./scripts/release.sh 0.1.0 --prerelease
#   ./scripts/release.sh 1.0.0
#   ./scripts/release.sh 1.0.0 --protocol-version 2026-04-10

REPO_URL="https://github.com/openagentprotocol/spec"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <version> [--prerelease] [--protocol-version <YYYY-MM-DD>]"
  echo ""
  echo "Examples:"
  echo "  $0 0.2.0 --prerelease"
  echo "  $0 1.0.0"
  echo "  $0 1.0.0 --protocol-version 2026-04-10"
  exit 1
fi

VERSION="$1"
TAG="v${VERSION}"
PRERELEASE=false
PROTOCOL_VERSION="$(date +%Y-%m-%d)"

shift
while [ $# -gt 0 ]; do
  case "$1" in
    --prerelease)
      PRERELEASE=true
      shift
      ;;
    --protocol-version)
      if [ -z "${2:-}" ]; then
        echo "Error: --protocol-version requires a YYYY-MM-DD argument."
        exit 1
      fi
      PROTOCOL_VERSION="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# Ensure we're on main and up to date
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Error: Must be on 'main' branch (currently on '$BRANCH')"
  exit 1
fi

echo "Fetching latest from origin..."
git fetch origin

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "Error: Local main is not up to date with origin/main. Pull first."
  exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: You have uncommitted changes. Commit or stash them first."
  exit 1
fi

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag '$TAG' already exists."
  exit 1
fi

echo ""
echo "=== OAP Release ==="
echo "  Version:          $TAG"
echo "  Pre-release:      $PRERELEASE"
echo "  Protocol version: $PROTOCOL_VERSION"
echo "  Commit:           $(git rev-parse --short HEAD)"
echo ""
read -p "Proceed? (y/N) " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

# Step 1: Stamp protocol version into spec files
# Detects the current version string already in the files and replaces it.
# Touches only:
#   - "version": "YYYY-MM-DD"  in JSON (examples, openapi, well-known)
#   - **Version:** YYYY-MM-DD  in Markdown spec pages
#   - version: "YYYY-MM-DD"    in Svelte/JS source
# Does NOT touch CloudEvent timestamp fields (time, startedAt, completedAt).
CURRENT_PROTO_VERSION=$(grep -r --include="*.json" --include="*.md" --include="*.svelte" \
  -hP '"version":\s*"\d{4}-\d{2}-\d{2}"' protocol/ specs/ website/src/ \
  | grep -oP '\d{4}-\d{2}-\d{2}' | sort | uniq | head -1)

if [ -z "$CURRENT_PROTO_VERSION" ]; then
  echo "Warning: Could not auto-detect current protocol version. Skipping version stamp."
elif [ "$CURRENT_PROTO_VERSION" = "$PROTOCOL_VERSION" ]; then
  echo "Protocol version is already $PROTOCOL_VERSION — no stamp needed."
else
  echo "Stamping protocol version: $CURRENT_PROTO_VERSION → $PROTOCOL_VERSION"

  # JSON files: replace "version": "YYYY-MM-DD"
  find protocol/ specs/ website/src/ -type f \( -name "*.json" -o -name "*.svelte" \) | while read -r f; do
    sed -i "s/\"version\": \"${CURRENT_PROTO_VERSION}\"/\"version\": \"${PROTOCOL_VERSION}\"/g" "$f"
  done

  # Markdown body references: replace bare version string inside backticks or quotes
  find specs/ -type f -name "*.md" | while read -r f; do
    sed -i "s/\`\"${CURRENT_PROTO_VERSION}\"\`/\`\"${PROTOCOL_VERSION}\"\`/g" "$f"
  done

  echo "Protocol version stamp complete."
  echo ""
  echo "Verify the changes look correct:"
  git diff --stat
  echo ""
  read -p "Commit version stamp and continue? (y/N) " STAMP_CONFIRM
  if [ "$STAMP_CONFIRM" != "y" ] && [ "$STAMP_CONFIRM" != "Y" ]; then
    echo "Aborted. Run 'git checkout .' to revert the stamp."
    exit 0
  fi
  git add -A
  if git diff --cached --quiet; then
    echo "No file changes after stamp (already at $PROTOCOL_VERSION) — skipping commit."
  else
    git commit -m "chore: stamp protocol version to ${PROTOCOL_VERSION} for release ${TAG}"
    git push origin main
  fi
fi

# Step 2: Create and push the tag
if [ "$PRERELEASE" = true ]; then
  git tag -a "$TAG" -m "OAP Specification $TAG (pre-release)"
else
  git tag -a "$TAG" -m "OAP Specification $TAG"
fi

echo "Pushing tag $TAG..."
git push origin "$TAG"

# Step 3: Create GitHub Release (if gh CLI is available)
if command -v gh &>/dev/null; then
  echo "Creating GitHub Release..."
  if [ "$PRERELEASE" = true ]; then
    gh release create "$TAG" --title "OAP $TAG" --notes "Pre-release of the Open Agent Protocol specification." --prerelease
  else
    gh release create "$TAG" --title "OAP $TAG" --notes "Release of the Open Agent Protocol specification."
  fi
  echo "GitHub Release created."
else
  echo ""
  echo "gh CLI not found. Create the release manually:"
  echo "  ${REPO_URL}/releases/new?tag=${TAG}&prerelease=$PRERELEASE"
fi

# Step 4: Update oap@stable tag for stable releases
if [ "$PRERELEASE" = false ]; then
  echo "Updating oap@stable tag..."
  git tag -f -a oap@stable "$TAG" -m "Stable pointer to $TAG"
  git push origin oap@stable --force
  echo "oap@stable now points to $TAG"
fi

echo ""
echo "=== Done ==="
echo "Tag:     $TAG"
echo "Release: ${REPO_URL}/releases/tag/${TAG}"
echo ""
echo "Don't forget to update the README.md documents table if needed."
