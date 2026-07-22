#!/usr/bin/env bash
set -euo pipefail

# best-validate Release Script
# Usage: ./scripts/release-validate.sh [<version>]
#
# If no version is given, the script reads the latest validate/v* tag and
# automatically bumps the patch version.
#
# To check the latest tag yourself:
#   git tag --list 'validate/v*' --sort=-version:refname | head -1
#
# Examples:
#   ./scripts/release-validate.sh          # auto patch bump (e.g. 0.1.0 → 0.1.1)
#   ./scripts/release-validate.sh 0.2.0    # explicit minor bump

REPO_URL="https://github.com/behavioralstate/spec"
PACKAGE_FILE="validate-cli/package.json"

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
  LATEST_TAG=$(git tag --list 'validate/v*' --sort=-version:refname | head -1)
  if [ -z "$LATEST_TAG" ]; then
    echo "Error: No validate/v* tags found. Specify a version explicitly: $0 <version>"
    exit 1
  fi
  LATEST_VERSION="${LATEST_TAG#validate/v}"
  MAJOR=$(echo "$LATEST_VERSION" | cut -d. -f1)
  MINOR=$(echo "$LATEST_VERSION" | cut -d. -f2)
  PATCH=$(echo "$LATEST_VERSION" | cut -d. -f3)
  VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
  echo "Latest tag: $LATEST_TAG → auto patch bump to $VERSION"
  echo "(To do a minor or major bump, run: $0 <version>)"
  echo ""
fi

TAG="validate/v${VERSION}"

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag '$TAG' already exists."
  exit 1
fi

CURRENT_VERSION=$(node -e "process.stdout.write(require('./${PACKAGE_FILE}').version)")

echo ""
echo "=== best-validate Release ==="
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

# Step 1: Bump version in package.json (skipped when already at the target —
# e.g. the first release, where the package was authored at its release version)
if [ "$CURRENT_VERSION" = "$VERSION" ]; then
  echo "package.json already at ${VERSION} — no bump commit needed."
else
  echo "Bumping $PACKAGE_FILE: $CURRENT_VERSION → $VERSION"
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('${PACKAGE_FILE}', 'utf8'));
    pkg.version = '${VERSION}';
    fs.writeFileSync('${PACKAGE_FILE}', JSON.stringify(pkg, null, 2) + '\n');
  "
  git add "$PACKAGE_FILE"
  git commit -m "chore: bump validate-cli to ${VERSION}"
  git push origin main
fi

# Step 2: Tag and push
git tag -a "$TAG" -m "Release validate/v${VERSION}"
echo "Pushing tag $TAG..."
git push origin "$TAG"

echo ""
echo "=== Done ==="
echo "Tag:    $TAG"
echo "npm:    https://www.npmjs.com/package/@behavioralstate/best-validate/v/${VERSION}"
echo "CI:     ${REPO_URL}/actions"
