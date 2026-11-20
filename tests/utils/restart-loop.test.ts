// The restart loop behind `dev`: what it runs, what restarts it and how it ends.
import { promises as fs } from 'fs';
import { join, sep } from 'path';
import { tmpdir } from 'os';
import { PassThrough } from 'stream';
import { isIgnoredPath, RestartLoop, startRestartLoop } from '../../src/utils/restart-loop';

const posixOnly = process.platform === 'win32' ? test.skip : test;

// The command the loop runs in these tests. It records every start, the
// signals it receives and the input it reads in app.log, then stays up like a
// server until it is told to stop.
const APP = `
const fs = require('fs');
const log = line => fs.appendFileSync('app.log', line + '\\n');
log('start ' + process.pid + ' PORT=' + (process.env.PORT || '') + ' PATH0=' + process.env.PATH.split(require('path').delimiter)[0]);
for (const signal of ['SIGUSR2', 'SIGINT', 'SIGTERM']) {
  process.on(signal, () => { log('signal ' + signal + ' ' + process.pid); process.exit(0); });
}
process.stdin.on('data', data => log('input ' + String(data).trim()));
if (fs.existsSync('exit-code')) process.exit(Number(fs.readFileSync('exit-code', 'utf8')));
setInterval(() => {}, 1000);
`;

describe('isIgnoredPath', () => {
  const root = join(sep, 'project', 'src');

  test.each([
    [join(root, 'index.ts'), false],
    [join(root, 'routes', 'users.ts'), false],
    [join(root, 'node_modules', 'pkg', 'index.js'), true],
    [join(root, 'routes', 'coverage', 'lcov.json'), true],
    [join(root, '.git', 'config'), true],
    [join(root, '.cache.json'), true],
    [join(root, 'routes', '.tmp', 'a.ts'), true],
  ])('%s -> %s', (path, ignored) => {
    expect(isIgnoredPath(path, [root])).toBe(ignored);
  });

  test('a watched path is kept even when its own name is on the list', () => {
    const dotRoot = join(sep, 'project', '.config');
    expect(isIgnoredPath(dotRoot, [dotRoot])).toBe(false);
    expect(isIgnoredPath(join(dotRoot, 'app.json'), [dotRoot])).toBe(false);
    expect(isIgnoredPath(join(dotRoot, 'node_modules', 'a.js'), [dotRoot])).toBe(true);
  });
});

describe('startRestartLoop', () => {
  let workDir: string;
  let loop: RestartLoop | undefined;
  let messages: string[];

  const logger = {
    info: (message: string) => messages.push(`info ${message}`),
    error: (message: string) => messages.push(`error ${message}`),
  };

  beforeEach(async () => {
    workDir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'moro-loop-')));
    await fs.mkdir(join(workDir, 'src'), { recursive: true });
    await fs.writeFile(join(workDir, 'app.js'), APP);
    messages = [];
    loop = undefined;
  });

  afterEach(async () => {
    if (loop) {
      loop.stop();
      await loop.done;
    }
    await fs.rm(workDir, { recursive: true, force: true });
  });

  const write = async (file: string, content = '') => {
    await fs.mkdir(join(workDir, file, '..'), { recursive: true });
    await fs.writeFile(join(workDir, file), content);
  };
  const appLog = async (): Promise<string[]> => {
    try {
      return (await fs.readFile(join(workDir, 'app.log'), 'utf8')).split('\n').filter(Boolean);
    } catch {
      return [];
    }
  };
  const starts = async () => (await appLog()).filter(line => line.startsWith('start '));
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(condition: () => Promise<boolean> | boolean, what: string): Promise<void> {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await condition()) return;
      await pause(50);
    }
    throw new Error(`timed out waiting for ${what}`);
  }
  const isRunning = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  function run(overrides: Partial<Parameters<typeof startRestartLoop>[0]> = {}): RestartLoop {
    loop = startRestartLoop({
      command: 'node app.js',
      watch: ['src'],
      extensions: ['ts', 'js', 'json'],
      cwd: workDir,
      logger,
      ...overrides,
    });
    return loop;
  }

  test('runs the command with the given environment and the project bin directory on PATH', async () => {
    run({ env: { ...process.env, PORT: '4100' } });

    await waitFor(async () => (await starts()).length === 1, 'the first start');
    const [line] = await starts();
    expect(line).toContain('PORT=4100');
    expect(line).toContain(`PATH0=${join(workDir, 'node_modules', '.bin')}`);
    expect(messages).toContain('info starting `node app.js`');
  });

  posixOnly('a change to a watched file type restarts the command with SIGUSR2', async () => {
    const running = run();
    await running.ready;
    await waitFor(async () => (await starts()).length === 1, 'the first start');

    await write('src/routes/users.ts', 'export {};\n');

    await waitFor(async () => (await starts()).length === 2, 'the restart');
    const lines = await appLog();
    const firstPid = lines[0].split(' ')[1];
    expect(lines).toContain(`signal SIGUSR2 ${firstPid}`);
    expect(messages).toContain('info restarting due to changes...');
  });

  test('other file types, dot files and ignored directories do not restart it', async () => {
    const running = run();
    await running.ready;
    await waitFor(async () => (await starts()).length === 1, 'the first start');

    await write('src/notes.md', 'notes\n');
    await write('src/.cache.json', '{}\n');
    await write('src/node_modules/pkg/index.js', '\n');
    await write('outside.ts', 'export {};\n');
    await pause(800);

    expect(await starts()).toHaveLength(1);
    expect(messages).not.toContain('info restarting due to changes...');
  });

  test('several watched paths are all watched', async () => {
    await fs.mkdir(join(workDir, 'config'));
    const running = run({ watch: ['src', 'config'] });
    await running.ready;
    await waitFor(async () => (await starts()).length === 1, 'the first start');

    await write('config/app.json', '{}\n');

    await waitFor(async () => (await starts()).length === 2, 'the restart');
  });

  test('after the command exits, the next change starts it again', async () => {
    await write('exit-code', '0');
    const running = run();
    await running.ready;
    await waitFor(
      () => messages.includes('info clean exit - waiting for changes before restart'),
      'the clean exit'
    );

    await write('exit-code', '3');
    await write('src/index.ts', 'export {};\n');
    await waitFor(
      () => messages.includes('error app crashed - waiting for file changes before starting...'),
      'the crash'
    );

    await fs.rm(join(workDir, 'exit-code'));
    await write('src/index.ts', 'export const fixed = true;\n');
    await waitFor(async () => (await starts()).length === 3, 'the third start');
  });

  test('"rs" on the input restarts the command; other input reaches it', async () => {
    const stdin = new PassThrough();
    run({ stdin });
    await waitFor(async () => (await starts()).length === 1, 'the first start');

    stdin.write('hello\n');
    await waitFor(async () => (await appLog()).includes('input hello'), 'the forwarded input');

    stdin.write('rs\n');
    await waitFor(async () => (await starts()).length === 2, 'the restart');
    expect(await appLog()).not.toContain('input rs');
  });

  posixOnly.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('stop(%s) ends the command and reports %i', async (signal, code) => {
    // The command runs through a shell and a second process, as
    // `npm run build && node ...` does: all of them have to be gone.
    const running = run({ command: 'node app.js && node -e ""' });
    await waitFor(async () => (await starts()).length === 1, 'the first start');
    const pid = Number((await starts())[0].split(' ')[1]);

    running.stop(signal);

    expect(await running.done).toBe(code);
    expect(await appLog()).toContain(`signal ${signal} ${pid}`);
    // An exited process stays visible until the system has collected it.
    await waitFor(() => !isRunning(pid), 'the command to be gone');

    await write('src/index.ts', 'export {};\n');
    await pause(400);
    expect(await starts()).toHaveLength(1);
  });
});
