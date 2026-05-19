#!/usr/bin/env bash
set -euo pipefail

# bsp-mcp Release Script
# Usage: ./scripts/release-mcp.sh <version>
#
# Examples:
#   ./scripts/release-mcp.sh 1.5.8
#   ./scripts/release-mcp.sh 2.0.0

REPO_URL="https://github.com/behavioralstate/spec"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <version>"
  echo ""
  echo "Examples:"
  echo "  $0 1.5.8"
  echo "  $0 2.0.0"
  exit 1
fi

VERSION="$1"
TAG="mcp/v${VERSION}"
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

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag '$TAG' already exists."
  exit 1
fi

# Read current version from package.json
CURRENT_VERSION=$(node -e "process.stdout.write(require('./${PACKAGE_FILE}').version)")

if [ "$CURRENT_VERSION" = "$VERSION" ]; then
  echo "Error: package.json is already at version $VERSION — bump to a new version."
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
