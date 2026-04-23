#!/usr/bin/env bash
#
# MoroJS CLI Release Publish Script
#
# Reads the version from package.json, then commits whatever you've STAGED,
# tags `vX.Y.Z`, pushes branch + tag, and opens a GitHub Release (which
# triggers .github/workflows/publish.yml to publish to npm).
#
# Workflow:
#   1. You bump the version in package.json (and any other release changes)
#   2. You stage them:   git add -A   (or just the files you want)
#   3. You publish:      npm run publish-release
#
# Usage:
#   npm run publish-release                # commit staged + tag + push + release
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
      sed -n '2,22p' "$0"
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

# --- Read version from package.json -----------------------------------------

VERSION="$(node -p "require('./package.json').version")"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "package.json version '${VERSION}' is not a valid semver triple." >&2
  exit 1
fi

TAG="v${VERSION}"

# --- Preflight: git state ---------------------------------------------------

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
  echo "Refusing to publish: on branch '${CURRENT_BRANCH}', expected '${RELEASE_BRANCH}'." >&2
  echo "  Override with: RELEASE_BRANCH=${CURRENT_BRANCH} npm run publish-release" >&2
  exit 1
fi

# Must have staged changes — that's what we're committing.
if git diff --cached --quiet; then
  echo "Nothing is staged. Stage your release changes first:" >&2
  echo "  git add -A" >&2
  exit 1
fi

# Warn (don't fail) on unstaged or untracked files — they won't make the cut.
UNSTAGED="$(git diff --name-only)"
UNTRACKED="$(git ls-files --others --exclude-standard)"
if [ -n "$UNSTAGED" ] || [ -n "$UNTRACKED" ]; then
  echo "  WARNING: the following changes are NOT staged and will not be in the release commit:"
  [ -n "$UNSTAGED" ]  && echo "$UNSTAGED"  | sed 's/^/    M /'
  [ -n "$UNTRACKED" ] && echo "$UNTRACKED" | sed 's/^/    ? /'
fi

if ! git remote get-url "$GIT_REMOTE" >/dev/null 2>&1; then
  echo "Remote '${GIT_REMOTE}' is not configured." >&2
  exit 1
fi

git fetch --tags "$GIT_REMOTE" >/dev/null

# Local must not be behind remote.
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "${GIT_REMOTE}/${RELEASE_BRANCH}" 2>/dev/null || true)"
if [ -n "$REMOTE_SHA" ] && [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  if ! git merge-base --is-ancestor "$REMOTE_SHA" HEAD; then
    echo "Local '${RELEASE_BRANCH}' is behind '${GIT_REMOTE}/${RELEASE_BRANCH}'." >&2
    echo "  Pull/rebase before publishing: git pull --rebase ${GIT_REMOTE} ${RELEASE_BRANCH}" >&2
    exit 1
  fi
fi

# Tag must not already exist.
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag '${TAG}' already exists locally. Bump the version in package.json first." >&2
  exit 1
fi
if git ls-remote --tags --exit-code "$GIT_REMOTE" "$TAG" >/dev/null 2>&1; then
  echo "Tag '${TAG}' already exists on '${GIT_REMOTE}'. Bump the version in package.json first." >&2
  exit 1
fi

step "Publishing @morojs/cli ${VERSION} (tag: ${TAG})"

# --- Commit staged changes --------------------------------------------------

step "Committing chore(release): ${TAG}"
run "git commit -m 'chore(release): ${TAG}'"

# --- Tag --------------------------------------------------------------------

step "Creating annotated tag ${TAG}"
run "git tag -a ${TAG} -m 'Release ${TAG}'"

# --- Push -------------------------------------------------------------------

step "Pushing ${RELEASE_BRANCH} to ${GIT_REMOTE}"
run "git push ${GIT_REMOTE} ${RELEASE_BRANCH}"

step "Pushing tag ${TAG} to ${GIT_REMOTE}"
run "git push ${GIT_REMOTE} ${TAG}"

# --- GitHub Release (triggers publish workflow) -----------------------------

if [ "$SKIP_RELEASE" = "1" ]; then
  echo ""
  echo "Skipping GitHub Release (--no-release). Tag pushed; create the release manually if you want npm publish."
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
  echo "Would have published: ${TAG}"
else
  echo "Released ${TAG}."
  echo "  - Version:        ${VERSION}"
  echo "  - Commit:         $(git rev-parse --short HEAD)"
  echo "  - Branch pushed:  ${GIT_REMOTE}/${RELEASE_BRANCH}"
  echo "  - Tag pushed:     ${TAG}"
  if [ "$SKIP_RELEASE" != "1" ]; then
    echo "  - GitHub Release: created (publish.yml will push to npm)"
    echo ""
    echo "Watch the publish workflow:"
    echo "  gh run watch --exit-status"
  fi
fi
