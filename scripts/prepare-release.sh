#!/usr/bin/env bash
#
# MoroJS CLI Release Preparation Script
#
# Bumps the version, runs the full validation pipeline (clean install, lint,
# tests, build, CLI smoke test, audit, pack), and commits the bump.
#
# Versioning policy (when no explicit version is passed):
#   - patch < 9:                bump patch        (1.0.5 -> 1.0.6)
#   - patch == 9, minor < 9:    roll to next minor (1.0.9 -> 1.1.0)
#   - patch == 9, minor == 9:   roll to next major (1.9.9 -> 2.0.0)
#
# Usage:
#   npm run prepare-release             # auto-bump using policy above
#   npm run prepare-release -- 1.5.0    # set an explicit version
#
# After this completes successfully, run:
#   npm run publish-release             # pushes branch + tag, opens GitHub Release

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

EXPLICIT_VERSION="${1:-}"

step() {
  echo ""
  echo "==> $*"
}

if [ ! -f package.json ]; then
  echo "package.json not found at $REPO_ROOT" >&2
  exit 1
fi

# --- Preflight: clean working tree ------------------------------------------
# We auto-commit the bump at the end, so the tree must be clean going in
# (otherwise we'd sweep up unrelated changes into the release commit).

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to prepare release: working tree has uncommitted changes." >&2
  echo "  Commit or stash them first." >&2
  git status --short >&2
  exit 1
fi

# --- Compute next version ---------------------------------------------------

CURRENT_VERSION="$(node -p "require('./package.json').version")"

if [ -n "$EXPLICIT_VERSION" ]; then
  NEXT_VERSION="$EXPLICIT_VERSION"
else
  NEXT_VERSION="$(node -e "
    const v = require('./package.json').version;
    const [maj, min, pat] = v.split('.').map(Number);
    if ([maj, min, pat].some(n => Number.isNaN(n))) {
      console.error('Cannot auto-bump non-numeric version: ' + v);
      process.exit(1);
    }
    let next;
    if (pat < 9)        next = [maj,     min,     pat + 1];
    else if (min < 9)   next = [maj,     min + 1, 0];
    else                next = [maj + 1, 0,       0];
    console.log(next.join('.'));
  ")"
fi

# Validate next version is a clean semver triple.
if ! [[ "$NEXT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Computed version '${NEXT_VERSION}' is not a valid semver triple." >&2
  exit 1
fi

if [ "$NEXT_VERSION" = "$CURRENT_VERSION" ]; then
  echo "Next version (${NEXT_VERSION}) is the same as current. Nothing to do." >&2
  exit 1
fi

# Make sure tag doesn't already exist (locally or on origin).
TAG="v${NEXT_VERSION}"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag '${TAG}' already exists locally. Pick a different version." >&2
  exit 1
fi
if git remote get-url origin >/dev/null 2>&1; then
  git fetch --tags origin >/dev/null 2>&1 || true
  if git ls-remote --tags --exit-code origin "$TAG" >/dev/null 2>&1; then
    echo "Tag '${TAG}' already exists on origin. Pick a different version." >&2
    exit 1
  fi
fi

step "Preparing @morojs/cli ${CURRENT_VERSION} -> ${NEXT_VERSION}"

# --- Bump version (no git tag; we tag in publish-release) -------------------

step "Bumping version to ${NEXT_VERSION}"
npm version "$NEXT_VERSION" --no-git-tag-version --allow-same-version >/dev/null
echo "  package.json + package-lock.json updated"

# --- Validation pipeline ----------------------------------------------------

step "Cleaning previous build"
npm run clean

step "Installing dependencies (npm ci)"
npm ci

step "Running linter"
npm run lint

step "Running tests"
npm test

step "Building project"
npm run build

step "Verifying CLI"
node dist/cli.js --version
node dist/cli.js --help > /dev/null

step "Running security audit"
npm audit

step "Verifying package contents"
npm pack --dry-run

# --- Commit the bump --------------------------------------------------------

step "Committing release bump"
git add package.json package-lock.json
git commit -m "chore(release): ${TAG}"

# --- Done -------------------------------------------------------------------

echo ""
echo "Release preparation complete."
echo "  Version:  ${CURRENT_VERSION} -> ${NEXT_VERSION}"
echo "  Tag:      ${TAG}  (will be created by publish-release)"
echo "  Commit:   $(git rev-parse --short HEAD)"
echo ""
echo "Next:"
echo "  npm run publish-release         # push branch + tag, create GitHub Release"
echo "  npm run publish-release -- --dry-run   # preview without changing anything"
