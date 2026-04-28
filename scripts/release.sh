#!/usr/bin/env bash
set -euo pipefail

# OAP Release Script
# Usage: ./scripts/release.sh <version> [--prerelease] [--protocol-version <MAJOR.MINOR.PATCH>]
#
# --protocol-version  Semver string to write to version.json as the OAP protocol version.
#                     Defaults to the release version argument.
#                     version.json is the single source of truth — the build pipeline
#                     stamps {{OAP_VERSION}} placeholders at build time, so no other
#                     files need to be edited.
#
# Examples:
#   ./scripts/release.sh 0.4.0 --prerelease
#   ./scripts/release.sh 1.0.0
#   ./scripts/release.sh 1.1.0 --protocol-version 1.1.0

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
PROTOCOL_VERSION="$VERSION"

shift
while [ $# -gt 0 ]; do
  case "$1" in
    --prerelease)
      PRERELEASE=true
      shift
      ;;
    --protocol-version)
      if [ -z "${2:-}" ]; then
        echo "Error: --protocol-version requires a MAJOR.MINOR.PATCH argument."
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

# Step 1: Update version.json — the single source of truth for the protocol version.
# The build pipeline (copy-protocol.mjs, +page.server.ts) reads this at build time
# and stamps {{OAP_VERSION}} placeholders in protocol files and spec pages.
CURRENT_PROTO_VERSION=$(node -e "process.stdout.write(require('./version.json').version)")

if [ "$CURRENT_PROTO_VERSION" = "$PROTOCOL_VERSION" ]; then
  echo "Protocol version is already $PROTOCOL_VERSION — no update needed."
else
  echo "Updating version.json: $CURRENT_PROTO_VERSION → $PROTOCOL_VERSION"
  echo "{ \"version\": \"${PROTOCOL_VERSION}\" }" > version.json
  git add version.json
  if git diff --cached --quiet; then
    echo "No version.json change to commit."
  else
    git commit -m "chore: bump protocol version to ${PROTOCOL_VERSION} for release ${TAG}"
    git push origin main
  fi
fi

# Step 2: Update README.md documents table to reference the new tag
CURRENT_README_TAG=$(grep -oP '(?<=blob/)(v[0-9]+\.[0-9]+\.[0-9]+)' README.md | sort | uniq | head -1)
if [ -z "$CURRENT_README_TAG" ]; then
  echo "Warning: Could not detect current tag in README.md — skipping table update."
elif [ "$CURRENT_README_TAG" = "$TAG" ]; then
  echo "README.md already references $TAG — no update needed."
else
  echo "Updating README.md: $CURRENT_README_TAG → $TAG"
  sed -i "s|blob/${CURRENT_README_TAG}/|blob/${TAG}/|g" README.md
  sed -i "s|\[${CURRENT_README_TAG}\](${REPO_URL}/blob/${TAG}/|[${TAG}](${REPO_URL}/blob/${TAG}/|g" README.md
  sed -i "s|releases/tag/${CURRENT_README_TAG}|releases/tag/${TAG}|g" README.md
  if [ "$PRERELEASE" = true ]; then
    sed -i "s|The most recent pre-release is \[${CURRENT_README_TAG}\]([^)]*)|The most recent pre-release is [${TAG}](${REPO_URL}/releases/tag/${TAG})|g" README.md
  else
    sed -i "s|The most recent.*is \[${CURRENT_README_TAG}\]([^)]*)|The most recent stable release is [${TAG}](${REPO_URL}/releases/tag/${TAG})|g" README.md
  fi
  git add README.md
  if git diff --cached --quiet; then
    echo "No README.md changes to commit."
  else
    git commit -m "chore: update README docs table to ${TAG}"
    git push origin main
  fi
fi

# Step 3: Create and push the tag
if [ "$PRERELEASE" = true ]; then
  git tag -a "$TAG" -m "OAP Specification $TAG (pre-release)"
else
  git tag -a "$TAG" -m "OAP Specification $TAG"
fi

echo "Pushing tag $TAG..."
git push origin "$TAG"

# Step 4: Create GitHub Release (if gh CLI is available)
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

# Step 5: Update oap@stable tag for stable releases
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
