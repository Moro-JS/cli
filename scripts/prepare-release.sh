#!/usr/bin/env bash
#
# MoroJS CLI Release Preparation Script
#
# Validation-only: confirms the package is releasable. Does NOT touch the
# version or git in any way. Use this before `npm run publish-release`, or
# run them together via `npm run release`.
#
# Steps:
#   - Clean previous build
#   - Reinstall deps (npm ci)
#   - Lint
#   - Test
#   - Build
#   - CLI smoke test
#   - npm audit of the shipped dependencies (fails the run), then of the whole
#     tree including development dependencies (printed, never fails the run)
#   - Pack dry-run

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

step() {
  echo ""
  echo "==> $*"
}

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

step "Checking shipped dependencies for known vulnerabilities"
npm audit --omit=dev --audit-level=moderate

step "Whole-tree npm audit, development dependencies included (information only)"
npm audit || true

step "Verifying package contents"
npm pack --dry-run

echo ""
echo "Release preparation complete."
echo ""
echo "Next:"
echo "  1. Bump the version in package.json"
echo "  2. Stage your release changes:   git add -A"
echo "  3. Publish:                      npm run publish-release"
echo ""
echo "  (preview first with: npm run publish-release -- --dry-run)"
