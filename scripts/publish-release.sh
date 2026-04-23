#!/usr/bin/env bash
#
# MoroJS CLI Release Publish Script
#
# Post-step for `npm run prepare-release`. This script:
#   1. Reads the version from package.json
#   2. Verifies the working tree is clean and on the expected branch
#   3. Verifies the tag doesn't already exist (locally or on origin)
#   4. Pushes the branch to origin
#   5. Creates an annotated `vX.Y.Z` tag and pushes it
#   6. Creates a GitHub Release (which triggers .github/workflows/publish.yml)
#
# Usage:
#   npm run publish-release                # publish current package.json version
#   npm run publish-release -- --dry-run   # show what would happen, change nothing
#   npm run publish-release -- --no-release # push tag only, skip GitHub Release
#
# Environment:
#   RELEASE_BRANCH   default: main
#   GIT_REMOTE       default: origin

set -euo pipefail

RELEASE_BRANCH="${RELEASE_BRANCH:-main}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
DRY_RUN=0
SKIP_RELEASE=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-release) SKIP_RELEASE=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "  [dry-run] $*"
  else
    eval "$@"
  fi
}

step() {
  echo ""
  echo "==> $*"
}

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f package.json ]; then
  echo "package.json not found at $REPO_ROOT" >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
PKG_NAME="$(node -p "require('./package.json').name")"
TAG="v${VERSION}"

step "Publishing ${PKG_NAME}@${VERSION} (tag: ${TAG})"

# --- Preflight checks -------------------------------------------------------

step "Checking git state"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository" >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "$RELEASE_BRANCH" ]; then
  echo "Refusing to release: on branch '${CURRENT_BRANCH}', expected '${RELEASE_BRANCH}'." >&2
  echo "  Override with: RELEASE_BRANCH=${CURRENT_BRANCH} npm run publish-release" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to release: working tree has uncommitted changes." >&2
  echo "  Commit or stash them first." >&2
  git status --short >&2
  exit 1
fi

# Make sure we have the latest remote refs (and that origin exists).
if ! git remote get-url "$GIT_REMOTE" >/dev/null 2>&1; then
  echo "Remote '${GIT_REMOTE}' is not configured." >&2
  exit 1
fi

git fetch --tags "$GIT_REMOTE" >/dev/null

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag '${TAG}' already exists locally. Aborting." >&2
  exit 1
fi

if git ls-remote --tags --exit-code "$GIT_REMOTE" "$TAG" >/dev/null 2>&1; then
  echo "Tag '${TAG}' already exists on '${GIT_REMOTE}'. Aborting." >&2
  exit 1
fi

# Make sure local branch is up to date with the remote tip.
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "${GIT_REMOTE}/${RELEASE_BRANCH}" 2>/dev/null || true)"
if [ -n "$REMOTE_SHA" ] && [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  if ! git merge-base --is-ancestor "$REMOTE_SHA" HEAD; then
    echo "Local '${RELEASE_BRANCH}' is behind '${GIT_REMOTE}/${RELEASE_BRANCH}'." >&2
    echo "  Pull/rebase before publishing: git pull --rebase ${GIT_REMOTE} ${RELEASE_BRANCH}" >&2
    exit 1
  fi
fi

# --- Push branch ------------------------------------------------------------

step "Pushing ${RELEASE_BRANCH} to ${GIT_REMOTE}"
run "git push ${GIT_REMOTE} ${RELEASE_BRANCH}"

# --- Tag + push -------------------------------------------------------------

step "Creating annotated tag ${TAG}"
run "git tag -a ${TAG} -m 'Release ${TAG}'"

step "Pushing tag ${TAG} to ${GIT_REMOTE}"
run "git push ${GIT_REMOTE} ${TAG}"

# --- GitHub Release (triggers publish workflow) -----------------------------

if [ "$SKIP_RELEASE" = "1" ]; then
  echo ""
  echo "Skipping GitHub Release (--no-release). Tag pushed; you can create the release manually."
else
  if ! command -v gh >/dev/null 2>&1; then
    echo ""
    echo "gh CLI not found. Tag pushed, but GitHub Release was NOT created." >&2
    echo "Install gh (https://cli.github.com/) or create the release manually:" >&2
    echo "  https://github.com/Moro-JS/cli/releases/new?tag=${TAG}" >&2
    exit 1
  fi

  step "Creating GitHub Release ${TAG}"
  run "gh release create ${TAG} --title 'Release ${TAG}' --generate-notes"
fi

# --- Done -------------------------------------------------------------------

echo ""
if [ "$DRY_RUN" = "1" ]; then
  echo "Dry run complete. No changes were made."
else
  echo "Release ${TAG} published."
  echo "  - Branch pushed:  ${GIT_REMOTE}/${RELEASE_BRANCH}"
  echo "  - Tag pushed:     ${TAG}"
  if [ "$SKIP_RELEASE" != "1" ]; then
    echo "  - GitHub Release: created (publish.yml will push to npm)"
    echo ""
    echo "Watch the publish workflow:"
    echo "  gh run watch --exit-status"
  fi
fi
