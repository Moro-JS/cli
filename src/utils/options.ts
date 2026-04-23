// Shared helpers for CLI option parsing, validation and error handling.
import chalk from 'chalk';
import { createFrameworkLogger } from '../logger';

const logger = createFrameworkLogger('CLI');

/**
 * Wrap a commander action handler so every command shares the same
 * error-handling behavior (log + exit 1) without try/catch boilerplate.
 */
export function withErrorHandling<TArgs extends unknown[]>(
  scope: string,
  fn: (...args: TArgs) => Promise<void> | void
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs): Promise<void> => {
    try {
      await fn(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`${scope} failed: ${message}`, scope);
      process.exit(1);
    }
  };
}

/**
 * Tiny Levenshtein distance for "did you mean ...?" suggestions.
 * Avoids pulling in another dependency for ~20 lines of code.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) prev[i] = i;

  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    let leftDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(curr + 1, prev[j] + 1, leftDiag + cost);
      leftDiag = prev[j];
      prev[j] = next;
      curr = next;
    }
  }
  return prev[b.length];
}

/**
 * Find the closest match in `candidates` for `input`, within a max edit distance.
 */
export function suggest(
  input: string,
  candidates: readonly string[],
  maxDistance = 3
): string | null {
  let best: { value: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const d = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (d <= maxDistance && (!best || d < best.distance)) {
      best = { value: candidate, distance: d };
    }
  }
  return best ? best.value : null;
}

export interface ValidateChoiceOptions {
  /** Human-readable name of the option (e.g. "runtime"). Used in error messages. */
  name: string;
  /** The value the user supplied. */
  value: string | undefined;
  /** Allowed values. */
  allowed: readonly string[];
}

/**
 * Validates a single-value option against an allowlist.
 * Throws (with a friendly "did you mean...?" hint) if the value is invalid.
 * Returns the value unchanged if it's valid (or undefined was passed).
 */
export function validateChoice<T extends string>({
  name,
  value,
  allowed,
}: ValidateChoiceOptions): T | undefined {
  if (value === undefined) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value as T;

  const hint = suggest(value, allowed);
  const allowedList = allowed.join(', ');
  const suffix = hint ? ` Did you mean "${chalk.cyan(hint)}"?` : '';
  throw new Error(`Invalid value for --${name}: "${value}". Allowed: ${allowedList}.${suffix}`);
}

/**
 * Validates a comma-separated list option (e.g. --features=auth,cors,docs).
 * Returns the parsed/normalized array, or throws with a per-token hint.
 */
export function validateList({ name, value, allowed }: ValidateChoiceOptions): string[] {
  if (!value) return [];
  const tokens = value
    .split(',')
    .map(token => token.trim())
    .filter(Boolean);

  const invalid: string[] = [];
  for (const token of tokens) {
    if (!(allowed as readonly string[]).includes(token)) invalid.push(token);
  }

  if (invalid.length === 0) return tokens;

  const hints = invalid
    .map(token => {
      const closest = suggest(token, allowed);
      return closest ? `"${token}" -> did you mean "${chalk.cyan(closest)}"?` : `"${token}"`;
    })
    .join('; ');

  throw new Error(`Invalid value(s) for --${name}: ${hints}. Allowed: ${allowed.join(', ')}.`);
}

/**
 * Reject conflicting global flags up-front (e.g. --quiet + --verbose).
 */
export function assertMutuallyExclusive(
  opts: Record<string, unknown>,
  flags: readonly string[]
): void {
  const set = flags.filter(flag => Boolean(opts[flag]));
  if (set.length > 1) {
    const list = set.map(f => `--${f}`).join(' and ');
    throw new Error(`Cannot combine ${list}. Pick one.`);
  }
}
