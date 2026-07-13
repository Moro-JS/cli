# Changelog

## v1.3.8

### Added

- **`moro stack` commands** — scaffold and inspect pre-wired application stacks (`api`, `saas`, `edge`) composed from `@morojs/stacks`:
  - `moro stack list` — list the available stacks
  - `moro stack describe <name>` — show what a stack composes, its options, and peer dependencies
  - `moro stack new <project-name>` — scaffold a new project from a stack (`--stack`, `--database`, `--package-manager`, `--force`)
  - `moro stack eject <name>` — eject a stack's composition into your project (`--force`)
- **`moro new --stack <api|saas|edge>`** — scaffold directly from a curated stack during project creation.

  > The stack commands require the optional `@morojs/stacks` package; if it isn't installed, they exit with an install hint.

### Changed

- **Node.js 20 is now the minimum supported version** — the CLI's `engines` field is bumped from `>=18` to `>=20`, matching `@morojs/moro` v1.8+. Node 18 has reached end-of-life.
- **Generated projects now target Node 20** — `moro new` scaffolds a `package.json` (`engines.node: ">=20.0.0"`), `Dockerfile` (`FROM node:20-alpine`), and Serverless/Lambda config (`runtime: nodejs20.x`) on Node 20.

### Upgrade notes

- No breaking command or API changes. New projects require Node 20+; existing generated projects are unaffected until regenerated.
