// Package manager detection + command resolution.
// Lets `init` work with npm, yarn or pnpm based on either an explicit
// --package-manager flag or the user agent that invoked the CLI.
//
// Bun is intentionally excluded: @morojs/moro is a Node.js framework
// (engines.node only, depends on uWebSockets.js) and bun-as-runtime isn't
// supported. Re-add bun here once the framework certifies it.

export const PACKAGE_MANAGERS = ['npm', 'yarn', 'pnpm'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/**
 * Detects the package manager that invoked this process. Falls back to npm.
 *
 * Works by parsing the `npm_config_user_agent` env var that npm/yarn/pnpm
 * all set when invoking lifecycle scripts (including `npx`/`yarn create`/etc).
 *
 * Examples of the env var:
 *   "npm/10.2.4 node/v20.10.0 darwin arm64"
 *   "pnpm/8.15.0 npm/? node/v20.10.0 darwin arm64"
 *   "yarn/4.0.2 npm/? node/v20.10.0 darwin arm64"
 */
export function detectPackageManager(): PackageManager {
  const ua = process.env.npm_config_user_agent || '';
  if (!ua) return 'npm';
  for (const pm of PACKAGE_MANAGERS) {
    if (ua.startsWith(`${pm}/`)) return pm;
  }
  return 'npm';
}

export interface PackageManagerCommands {
  /** Install all dependencies declared in package.json. */
  install: string;
  /** Add one runtime dependency, e.g. `installPackage('zod')`. */
  installPackage: (pkg: string, dev?: boolean) => string;
  /** Run a script defined in package.json. */
  run: (script: string) => string;
  /** Execute a binary (npx / yarn dlx / pnpm dlx / bunx). */
  exec: (binary: string) => string;
  /** Lockfile name (used in messaging only). */
  lockfile: string;
}

/**
 * Returns the canonical commands for the given package manager.
 */
export function commandsFor(pm: PackageManager): PackageManagerCommands {
  switch (pm) {
    case 'yarn':
      return {
        install: 'yarn install',
        installPackage: (pkg, dev = false) => `yarn add ${dev ? '--dev ' : ''}${pkg}`,
        run: script => `yarn ${script}`,
        exec: binary => `yarn dlx ${binary}`,
        lockfile: 'yarn.lock',
      };
    case 'pnpm':
      return {
        install: 'pnpm install',
        installPackage: (pkg, dev = false) => `pnpm add ${dev ? '--save-dev ' : ''}${pkg}`,
        run: script => `pnpm ${script}`,
        exec: binary => `pnpm dlx ${binary}`,
        lockfile: 'pnpm-lock.yaml',
      };
    case 'npm':
    default:
      return {
        install: 'npm install',
        installPackage: (pkg, dev = false) => `npm install ${dev ? '--save-dev ' : ''}${pkg}`,
        run: script => `npm run ${script}`,
        exec: binary => `npx ${binary}`,
        lockfile: 'package-lock.json',
      };
  }
}
