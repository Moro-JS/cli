// Lightweight "is there a newer version on npm?" check.
//
// Why not the `update-notifier` package?
//   v5 pulls in vulnerable `got@9` (GHSA-pfrx-2q88-qq97) via `package-json`,
//   and v6+ is ESM-only — incompatible with our CommonJS build target.
//   This in-house version has zero deps beyond what we already ship (boxen,
//   chalk) plus Node's built-in `https`, and matches `update-notifier`'s
//   public behavior: cached for 24h, silenced by NO_UPDATE_NOTIFIER / CI,
//   notification printed on process exit.

import { promises as fs } from 'fs';
import { request } from 'https';
import { homedir } from 'os';
import { dirname, join } from 'path';

import boxen from 'boxen';
import chalk from 'chalk';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;

interface CacheFile {
  lastCheck: number;
  latest: string;
}

interface PackageMeta {
  name: string;
  version: string;
}

function isSilenced(): boolean {
  return Boolean(
    process.env.NO_UPDATE_NOTIFIER ||
    process.env.NODE_ENV === 'test' ||
    process.env.CI ||
    process.argv.includes('--no-update-notifier')
  );
}

function cachePath(pkgName: string): string {
  const safe = pkgName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(homedir(), '.config', 'morojs-cli', `${safe}-update-check.json`);
}

async function readCache(file: string): Promise<CacheFile | null> {
  try {
    const data = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(data);
    if (typeof parsed?.lastCheck === 'number' && typeof parsed?.latest === 'string') {
      return parsed as CacheFile;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(file: string, data: CacheFile): Promise<void> {
  try {
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data));
  } catch {
    // Cache failures are never fatal.
  }
}

function fetchLatestVersion(pkgName: string): Promise<string | null> {
  return new Promise(resolve => {
    // Encode scope/name so `@morojs/cli` becomes `@morojs%2Fcli`.
    const encoded = pkgName.replace(/\//g, '%2F');
    const req = request(
      `https://registry.npmjs.org/${encoded}/latest`,
      { headers: { Accept: 'application/json' }, timeout: FETCH_TIMEOUT_MS },
      res => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve(typeof json?.version === 'string' ? json.version : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

/**
 * Strict-ish semver comparison: returns true if `latest` is a higher
 * release than `current`. Pre-release tags are stripped so we don't
 * notify users about beta releases when they're on a stable.
 */
function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const core = v.split(/[-+]/)[0];
    const [a, b, c] = core.split('.').map(n => Number.parseInt(n, 10));
    return [a || 0, b || 0, c || 0];
  };
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

function printNotification(pkg: PackageMeta, latest: string): void {
  const message = [
    `Update available ${chalk.dim(pkg.version)} ${chalk.dim('→')} ${chalk.green(latest)}`,
    `Run ${chalk.cyan(`npm i -g ${pkg.name}`)} to update`,
  ].join('\n');
  process.stderr.write(
    '\n' +
      boxen(message, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        align: 'center',
      }) +
      '\n'
  );
}

/**
 * Kicks off a non-blocking check for a newer version of `pkg` on npm.
 *
 * Behavior:
 *   - Silent if NO_UPDATE_NOTIFIER, CI, NODE_ENV=test, or --no-update-notifier.
 *   - Reads cache; if cache shows a newer version we already know about,
 *     schedules a notification on process exit (never blocks shutdown).
 *   - If cache is missing or older than 24h, fetches `/<pkg>/latest` from
 *     the npm registry with a 1.5s timeout and refreshes the cache.
 *   - Any error (network, fs, parse) is swallowed silently.
 */
export function checkForUpdates(pkg: PackageMeta): void {
  if (isSilenced()) return;

  const file = cachePath(pkg.name);

  void (async () => {
    try {
      const cache = await readCache(file);
      const now = Date.now();

      if (cache && isNewerVersion(cache.latest, pkg.version)) {
        const latest = cache.latest;
        process.once('exit', () => printNotification(pkg, latest));
      }

      if (!cache || now - cache.lastCheck > CHECK_INTERVAL_MS) {
        const latest = await fetchLatestVersion(pkg.name);
        if (latest) {
          await writeCache(file, { lastCheck: now, latest });
        }
      }
    } catch {
      // Update checks must never break the CLI.
    }
  })();
}
