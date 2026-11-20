// Restart loop for `dev`: runs a shell command and runs it again whenever a
// watched file changes.
import { ChildProcess, execFile, spawn } from 'child_process';
import { delimiter, extname, join, relative, resolve, sep } from 'path';
import { watch as watchFiles, FSWatcher } from 'chokidar';

const isWindows = process.platform === 'win32';

// Directories that are never watched, wherever they sit below a watched path.
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.nyc_output',
  '.sass-cache',
  'bower_components',
  'coverage',
  'node_modules',
]);

/** Signal sent to the running command when it has to make way for a restart. */
export const RESTART_SIGNAL: NodeJS.Signals = 'SIGUSR2';

/** Exit codes reported after the loop was stopped by a signal (128 + signal number). */
const STOP_EXIT_CODES: Record<'SIGINT' | 'SIGTERM', number> = { SIGINT: 130, SIGTERM: 143 };

// How long a stop waits for the command to finish before it is killed.
const STOP_TIMEOUT_MS = 10_000;

// Saving one file can report several events; they lead to a single restart.
const CHANGE_SETTLE_MS = 100;

export interface RestartLoopLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface RestartLoopOptions {
  /** Shell command to run, for example `npm run build && node dist/index.js`. */
  command: string;
  /** Files or directories to watch, relative to `cwd`. */
  watch: string[];
  /** File extensions (without the dot) whose changes restart the command. */
  extensions: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  logger?: RestartLoopLogger;
  /** Stop on SIGINT / SIGTERM of this process. Off by default. */
  handleSignals?: boolean;
  /**
   * Input to read `rs` (restart now) from. Everything else read from it is
   * passed on to the command. Without it the command gets no input.
   */
  stdin?: NodeJS.ReadableStream;
}

export interface RestartLoop {
  /** Resolves once the initial scan is done and changes are being reported. */
  ready: Promise<void>;
  /** Resolves with the exit code for this process after the loop was stopped. */
  done: Promise<number>;
  /** Restart the command now, as a file change would. */
  restart(): void;
  /** Stop watching and end the command. */
  stop(signal?: 'SIGINT' | 'SIGTERM'): void;
}

/**
 * True for paths the loop does not watch: the ignored directories above and
 * anything whose name starts with a dot, at any depth below the watched path.
 * The watched path itself is always kept, whatever it is called.
 */
export function isIgnoredPath(path: string, roots: string[]): boolean {
  const target = resolve(path);
  const root = roots
    .filter(candidate => target === candidate || target.startsWith(candidate + sep))
    .sort((a, b) => b.length - a.length)[0];
  if (root === undefined || target === root) return false;

  return relative(root, target)
    .split(sep)
    .some(segment => segment.startsWith('.') || IGNORED_DIRECTORIES.has(segment));
}

/** The environment for the command: `cwd`'s node_modules/.bin comes first on PATH. */
function commandEnvironment(
  cwd: string,
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
  const binPath = join(cwd, 'node_modules', '.bin');
  return { ...env, [pathKey]: [binPath, env[pathKey]].filter(Boolean).join(delimiter) };
}

/** Sends `signal` to the command and everything it started. */
function signalTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;

  if (isWindows) {
    // The command runs under cmd.exe, which does not pass signals on: end the
    // whole process tree instead.
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => undefined);
    return;
  }

  try {
    // The command is the leader of its own process group (see start()).
    process.kill(-child.pid, signal);
  } catch {
    // The group is already gone.
  }
}

/** True while any process the command started is still running. */
function treeIsAlive(child: ChildProcess): boolean {
  if (isWindows || child.pid === undefined) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function startRestartLoop(options: RestartLoopOptions): RestartLoop {
  const cwd = options.cwd || process.cwd();
  const env = commandEnvironment(cwd, options.env || process.env);
  const logger = options.logger || { info: () => undefined, error: () => undefined };
  const roots = options.watch.map(path => resolve(cwd, path));
  const extensions = new Set(options.extensions.map(ext => ext.replace(/^\./, '').toLowerCase()));

  let child: ChildProcess | null = null;
  let restarting = false;
  let stopping = false;
  let ended = false;
  let changeTimer: NodeJS.Timeout | undefined;
  const timers = new Set<NodeJS.Timeout>();
  let finish: (code: number) => void = () => undefined;
  const done = new Promise<number>(resolvePromise => {
    finish = resolvePromise;
  });

  const start = (): void => {
    logger.info(`starting \`${options.command}\``);
    const started = spawn(options.command, {
      cwd,
      env,
      shell: true,
      stdio: [options.stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'],
      // Its own process group, so that a restart reaches every process the
      // command started and not only the shell that runs it.
      detached: !isWindows,
      windowsHide: true,
    });
    child = started;
    // The command may exit without reading its input.
    started.stdin?.on('error', () => undefined);

    started.on('error', error => {
      if (child !== started) return;
      child = null;
      logger.error(`could not run the command: ${error.message}`);
    });
    started.on('exit', code => whenTreeIsGone(started, () => onExit(started, code)));
  };

  // The shell can exit before the processes it started have finished handling
  // the signal; the next run starts only when all of them are gone.
  const whenTreeIsGone = (exited: ChildProcess, callback: () => void, waited = 0): void => {
    if (ended) return;
    if (!treeIsAlive(exited)) return callback();
    if (waited > 0 && waited % 1000 === 0) {
      logger.info('still waiting for the command to finish...');
    }
    const timer = setTimeout(() => {
      timers.delete(timer);
      whenTreeIsGone(exited, callback, waited + 100);
    }, 100);
    timers.add(timer);
  };

  const onExit = (exited: ChildProcess, code: number | null): void => {
    if (child !== exited) return;
    child = null;

    if (stopping) return;
    if (restarting) {
      restarting = false;
      start();
    } else if (code === 0) {
      logger.info('clean exit - waiting for changes before restart');
    } else {
      logger.error('app crashed - waiting for file changes before starting...');
    }
  };

  const restart = (): void => {
    if (stopping || restarting) return;
    logger.info('restarting due to changes...');
    if (!child) return start();
    restarting = true;
    signalTree(child, RESTART_SIGNAL);
  };

  const watcher: FSWatcher = watchFiles(roots, {
    ignoreInitial: true,
    ignorePermissionErrors: true,
    ignored: path => isIgnoredPath(path, roots),
  });
  const onFileEvent = (path: string): void => {
    if (stopping || !extensions.has(extname(path).slice(1).toLowerCase())) return;
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(restart, CHANGE_SETTLE_MS);
  };
  watcher.on('add', onFileEvent);
  watcher.on('change', onFileEvent);
  watcher.on('unlink', onFileEvent);
  watcher.on('error', error => {
    logger.error(`watch error: ${error instanceof Error ? error.message : String(error)}`);
  });
  const ready = new Promise<void>(resolvePromise => {
    watcher.once('ready', () => resolvePromise());
  });

  const onInput = (data: Buffer | string): void => {
    if (String(data).trim() === 'rs') return restart();
    child?.stdin?.write(data);
  };
  const onInputEnd = (): void => {
    child?.stdin?.end();
  };
  options.stdin?.on('data', onInput);
  options.stdin?.on('end', onInputEnd);

  const onSigint = (): void => stop('SIGINT');
  const onSigterm = (): void => stop('SIGTERM');
  if (options.handleSignals) {
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
  }

  function stop(signal: 'SIGINT' | 'SIGTERM' = 'SIGINT'): void {
    if (stopping) return;
    stopping = true;
    restarting = false;

    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    options.stdin?.removeListener('data', onInput);
    options.stdin?.removeListener('end', onInputEnd);
    (options.stdin as { pause?: () => void } | undefined)?.pause?.();
    if (changeTimer) clearTimeout(changeTimer);

    const running = child;
    const end = (): void => {
      if (ended) return;
      ended = true;
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
      void watcher.close().then(
        () => finish(STOP_EXIT_CODES[signal]),
        () => finish(STOP_EXIT_CODES[signal])
      );
    };

    if (!running) return end();

    // Give the command the same signal and time to shut down; after that it is killed.
    timers.add(
      setTimeout(() => {
        signalTree(running, 'SIGKILL');
        end();
      }, STOP_TIMEOUT_MS)
    );
    if (running.exitCode !== null || running.signalCode !== null) {
      // The shell has already exited and the rest of its tree is finishing.
      whenTreeIsGone(running, end);
    } else {
      running.once('exit', () => whenTreeIsGone(running, end));
    }
    signalTree(running, signal);
  }

  start();

  return { ready, done, restart, stop };
}
