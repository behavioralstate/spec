#!/usr/bin/env bash
set -euo pipefail

# bsp-mcp Release Script
# Usage: ./scripts/release-mcp.sh [<version>]
#
# If no version is given, the script reads the latest mcp/v* tag and
# automatically bumps the patch version.
#
# To check the latest tag yourself:
#   git tag --list 'mcp/v*' --sort=-version:refname | head -1
#
# Examples:
#   ./scripts/release-mcp.sh          # auto patch bump (e.g. 1.5.7 → 1.5.8)
#   ./scripts/release-mcp.sh 1.6.0    # explicit minor bump
#   ./scripts/release-mcp.sh 2.0.0    # explicit major bump

REPO_URL="https://github.com/behavioralstate/spec"
PACKAGE_FILE="mcp-server/package.json"

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

# Resolve version
if [ $# -ge 1 ]; then
  VERSION="$1"
else
  LATEST_TAG=$(git tag --list 'mcp/v*' --sort=-version:refname | head -1)
  if [ -z "$LATEST_TAG" ]; then
    echo "Error: No mcp/v* tags found. Specify a version explicitly: $0 <version>"
    exit 1
  fi
  # Strip 'mcp/v' prefix and bump patch
  LATEST_VERSION="${LATEST_TAG#mcp/v}"
  MAJOR=$(echo "$LATEST_VERSION" | cut -d. -f1)
  MINOR=$(echo "$LATEST_VERSION" | cut -d. -f2)
  PATCH=$(echo "$LATEST_VERSION" | cut -d. -f3)
  VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
  echo "Latest tag: $LATEST_TAG → auto patch bump to $VERSION"
  echo "(To do a minor or major bump, run: $0 <version>)"
  echo ""
fi

TAG="mcp/v${VERSION}"

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag '$TAG' already exists."
  exit 1
fi

# Read current version from package.json
CURRENT_VERSION=$(node -e "process.stdout.write(require('./${PACKAGE_FILE}').version)")

if [ "$CURRENT_VERSION" = "$VERSION" ]; then
  echo "Error: package.json is already at version $VERSION — this version is already tagged or prepared."
  exit 1
fi

echo ""
echo "=== bsp-mcp Release ==="
echo "  Current version: $CURRENT_VERSION"
echo "  New version:     $VERSION"
echo "  Tag:             $TAG"
echo "  Commit:          $(git rev-parse --short HEAD)"
echo ""
read -p "Proceed? (y/N) " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

# Step 1: Bump version in package.json
echo "Bumping $PACKAGE_FILE: $CURRENT_VERSION → $VERSION"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('${PACKAGE_FILE}', 'utf8'));
  pkg.version = '${VERSION}';
  fs.writeFileSync('${PACKAGE_FILE}', JSON.stringify(pkg, null, 2) + '\n');
"

git add "$PACKAGE_FILE"
git commit -m "chore: bump mcp-server to ${VERSION}"
git push origin main

# Step 2: Tag and push
git tag -a "$TAG" -m "Release mcp/v${VERSION}"
echo "Pushing tag $TAG..."
git push origin "$TAG"

echo ""
echo "=== Done ==="
echo "Tag:    $TAG"
echo "npm:    https://www.npmjs.com/package/@behavioralstate/bsp-mcp/v/${VERSION}"
echo "CI:     ${REPO_URL}/actions"
