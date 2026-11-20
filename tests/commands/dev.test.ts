// build / dev / lint / security:scan – what the commands run and write.
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

jest.mock('../../src/utils/terminal', () => ({
  runTerminalCmd: jest.fn(),
  spawnCommand: jest.fn(),
}));
jest.mock('../../src/utils/restart-loop', () => ({
  startRestartLoop: jest.fn(),
}));
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  exec: jest.fn(),
}));

import { exec } from 'child_process';
import { runTerminalCmd, spawnCommand } from '../../src/utils/terminal';
import { startRestartLoop } from '../../src/utils/restart-loop';
import {
  DevTools,
  devEntryRunner,
  eslintRejectsExtFlag,
  jestEnvironment,
  resolveBuiltEntry,
} from '../../src/commands/dev';

const runMock = runTerminalCmd as jest.MockedFunction<typeof runTerminalCmd>;
const spawnMock = spawnCommand as jest.MockedFunction<typeof spawnCommand>;
const execMock = exec as unknown as jest.Mock;
const loopMock = startRestartLoop as jest.MockedFunction<typeof startRestartLoop>;

describe('DevTools', () => {
  let workDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    // realpath: process.cwd() reports the resolved path of a symlinked tmpdir.
    workDir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'moro-dev-')));
    process.chdir(workDir);
    runMock.mockReset();
    spawnMock.mockReset();
    execMock.mockReset();
    spawnMock.mockResolvedValue(0);
    // A loop that was stopped with Ctrl+C straight away.
    loopMock.mockReset();
    loopMock.mockReturnValue({
      ready: Promise.resolve(),
      done: Promise.resolve(130),
      restart: jest.fn(),
      stop: jest.fn(),
    });
  });

  afterEach(async () => {
    // `dev` reports the loop's exit code through process.exitCode.
    process.exitCode = undefined;
    process.chdir(originalCwd);
    await fs.rm(workDir, { recursive: true, force: true });
  });

  const write = async (file: string, content = '') => {
    await fs.mkdir(join(workDir, file, '..'), { recursive: true });
    await fs.writeFile(join(workDir, file), content);
  };
  const read = (file: string) => fs.readFile(join(workDir, file), 'utf8');
  const exists = (file: string) =>
    fs.access(join(workDir, file)).then(
      () => true,
      () => false
    );

  // A project laid out like `init` scaffolds one: tsc emits dist/src/index.js.
  async function scaffoldedProject(): Promise<void> {
    await write('package.json', JSON.stringify({ name: 'app', main: 'dist/src/index.js' }));
  }

  // Stands in for the TypeScript compiler: emits the entry file where the
  // project's layout puts it and answers --showConfig.
  function fakeCompiler(entry: string, outDir = 'dist'): void {
    runMock.mockImplementation(async (command: string) => {
      if (command.includes('--showConfig')) {
        return {
          stdout: JSON.stringify({ compilerOptions: { outDir: `./${outDir}` } }),
          stderr: '',
        };
      }
      await write(entry, 'export const app = { getHandler() { return () => "handled"; } };\n');
      return { stdout: '', stderr: '' };
    });
  }

  describe('resolveBuiltEntry', () => {
    test('uses package.json main of a scaffolded project', async () => {
      await scaffoldedProject();
      expect(resolveBuiltEntry(workDir)).toBe('dist/src/index.js');
    });

    test('falls back to the file that exists, then to dist/index.js', async () => {
      expect(resolveBuiltEntry(workDir)).toBe('dist/index.js');

      await write('dist/src/index.js');
      expect(resolveBuiltEntry(workDir)).toBe('dist/src/index.js');

      await write('dist/index.js');
      expect(resolveBuiltEntry(workDir)).toBe('dist/index.js');
    });
  });

  describe('dev', () => {
    test('without nodemon, builds and runs the entry in its own restart loop', async () => {
      await scaffoldedProject();

      await new DevTools().startDevServer({ watch: 'src, config' });

      expect(spawnMock).not.toHaveBeenCalled();
      expect(loopMock).toHaveBeenCalledTimes(1);
      const [options] = loopMock.mock.calls[0];
      expect(options.command).toBe('npm run build && node dist/src/index.js');
      expect(options.watch).toEqual(['src', 'config']);
      expect(options.extensions).toEqual(['ts', 'js', 'json']);
      expect(options.handleSignals).toBe(true);
      expect(process.exitCode).toBe(130);
    });

    test('without nodemon, src is watched by default', async () => {
      await scaffoldedProject();

      await new DevTools().startDevServer({});

      expect(loopMock.mock.calls[0][0].watch).toEqual(['src']);
    });

    test('without nodemon, --port and --host reach the app through its environment', async () => {
      await scaffoldedProject();

      await new DevTools().startDevServer({ port: '4100', host: '0.0.0.0' });

      expect(loopMock.mock.calls[0][0].env).toMatchObject({ PORT: '4100', HOST: '0.0.0.0' });
    });

    test('without nodemon, PORT and HOST are left to the project when the flags are not given', async () => {
      await scaffoldedProject();
      const original = { PORT: process.env.PORT, HOST: process.env.HOST };
      delete process.env.PORT;
      delete process.env.HOST;

      try {
        await new DevTools().startDevServer({});

        const { env } = loopMock.mock.calls[0][0];
        expect(env?.PORT).toBeUndefined();
        expect(env?.HOST).toBeUndefined();
      } finally {
        if (original.PORT !== undefined) process.env.PORT = original.PORT;
        if (original.HOST !== undefined) process.env.HOST = original.HOST;
      }
    });

    describe('how the entry is run', () => {
      const features = process.features as { typescript?: unknown };
      const original = Object.getOwnPropertyDescriptor(features, 'typescript');

      // What process.features.typescript reports: 'strip' on a Node.js that
      // loads .ts files (22.18 and newer), false or absent on an older one.
      const nodeLoadsTypeScript = (value: unknown) =>
        Object.defineProperty(features, 'typescript', {
          value,
          configurable: true,
          enumerable: true,
        });

      afterEach(() => {
        if (original) Object.defineProperty(features, 'typescript', original);
        else delete features.typescript;
      });

      const loopCommand = async () => {
        await new DevTools().startDevServer({});
        return loopMock.mock.calls[0][0].command;
      };
      const nodemonCommand = async () => {
        await write('node_modules/.bin/nodemon');
        await new DevTools().startDevServer({});
        const args = spawnMock.mock.calls[0][1] as string[];
        return args[args.indexOf('--exec') + 1];
      };

      test.each(['strip', 'transform'])(
        'Node.js that loads TypeScript (%s): plain node, also when the project has tsx',
        async support => {
          nodeLoadsTypeScript(support);
          await scaffoldedProject();
          await write('moro.config.ts');
          await write('node_modules/.bin/tsx');

          expect(devEntryRunner(workDir)).toEqual({ runner: 'node' });
          expect(await loopCommand()).toBe('npm run build && node dist/src/index.js');
          expect(await nodemonCommand()).toBe('npm run build && node dist/src/index.js');
        }
      );

      test.each([false, undefined])(
        'Node.js that cannot (%s), project with tsx: the entry runs through tsx',
        async support => {
          nodeLoadsTypeScript(support);
          await scaffoldedProject();
          await write('moro.config.ts');
          await write('node_modules/.bin/tsx');

          expect(devEntryRunner(workDir)).toEqual({ runner: 'tsx' });
          expect(await loopCommand()).toBe('npm run build && tsx dist/src/index.js');
          expect(await nodemonCommand()).toBe('npm run build && tsx dist/src/index.js');
        }
      );

      test('Node.js that cannot, TypeScript project without tsx: node, and it says what is missing', async () => {
        nodeLoadsTypeScript(undefined);
        await scaffoldedProject();
        await write('moro.config.ts');

        const { runner, notice } = devEntryRunner(workDir);
        expect(runner).toBe('node');
        expect(notice).toContain('cannot load TypeScript files');
        expect(notice).toContain('Node.js 22.18 or newer');
        expect(notice).toContain('npm install tsx');
        expect(await loopCommand()).toBe('npm run build && node dist/src/index.js');
        expect(await nodemonCommand()).toBe('npm run build && node dist/src/index.js');
      });

      test('Node.js that cannot, project without TypeScript files: node and nothing to say', async () => {
        nodeLoadsTypeScript(undefined);
        await scaffoldedProject();

        expect(devEntryRunner(workDir)).toEqual({ runner: 'node' });
        expect(await loopCommand()).toBe('npm run build && node dist/src/index.js');
      });
    });

    test('with nodemon, executes the same entry and passes one --watch per path', async () => {
      await scaffoldedProject();
      await write('node_modules/.bin/nodemon');

      await new DevTools().startDevServer({ watch: 'src, config' });

      const [command, args] = spawnMock.mock.calls[0];
      expect(command).toBe('npx');
      expect(args).toContain('npm run build && node dist/src/index.js');
      const watched = (args as string[]).filter((_, i, all) => all[i - 1] === '--watch');
      expect(watched).toEqual(['src', 'config']);
      expect(loopMock).not.toHaveBeenCalled();
    });

    test('with nodemon, --port and --host reach the app through its environment', async () => {
      await scaffoldedProject();
      await write('node_modules/.bin/nodemon');

      await new DevTools().startDevServer({ port: '4100', host: '0.0.0.0' });

      const [, args, options] = spawnMock.mock.calls[0];
      // nodemon has no --env option; passing one only appended it to the app's arguments.
      expect(args).not.toContain('--env');
      expect(options?.env).toMatchObject({ PORT: '4100', HOST: '0.0.0.0' });
    });

    test('with nodemon, PORT and HOST are left to the project when the flags are not given', async () => {
      await scaffoldedProject();
      await write('node_modules/.bin/nodemon');
      const original = { PORT: process.env.PORT, HOST: process.env.HOST };
      delete process.env.PORT;
      delete process.env.HOST;

      try {
        await new DevTools().startDevServer({});

        const [, args, options] = spawnMock.mock.calls[0];
        expect(args).not.toContain('--env');
        expect(options?.env?.PORT).toBeUndefined();
        expect(options?.env?.HOST).toBeUndefined();
      } finally {
        if (original.PORT !== undefined) process.env.PORT = original.PORT;
        if (original.HOST !== undefined) process.env.HOST = original.HOST;
      }
    });
  });

  describe('build --target', () => {
    test.each([
      ['edge', 'export default app.getHandler();'],
      ['lambda', 'export const handler = app.getHandler();'],
      ['workers', 'fetch: app.getHandler()'],
    ] as const)(
      '%s writes a runtime file that imports the compiled entry',
      async (target, body) => {
        await scaffoldedProject();
        fakeCompiler('dist/src/index.js');

        await new DevTools().buildProject({ target });

        const runtime = await read('dist/runtime.js');
        expect(runtime).toContain(`import { app } from './src/index.js';`);
        expect(runtime).toContain(body);
      }
    );

    test('imports ./index.js when the project compiles to dist/index.js', async () => {
      await write('package.json', JSON.stringify({ name: 'flat', main: 'dist/index.js' }));
      fakeCompiler('dist/index.js');

      await new DevTools().buildProject({ target: 'lambda' });

      expect(await read('dist/runtime.js')).toContain(`import { app } from './index.js';`);

      // The node target needs no runtime file.
      await fs.rm(join(workDir, 'dist'), { recursive: true });
      await new DevTools().buildProject({ target: 'node' });
      expect(await exists('dist/runtime.js')).toBe(false);
    });
  });

  describe('build --output', () => {
    test('compiles into the requested directory and puts the runtime file there', async () => {
      await write('package.json', JSON.stringify({ name: 'app', main: 'dist/src/index.js' }));
      fakeCompiler('build/src/index.js', 'build');

      await new DevTools().buildProject({ target: 'workers', output: 'build' });

      expect(runMock).toHaveBeenCalledWith('npx tsc --outDir "build"');
      expect(await read('build/runtime.js')).toContain(`import { app } from './src/index.js';`);

      // Without --output the outDir of the project's tsconfig is left alone.
      runMock.mockClear();
      await new DevTools().buildProject({ target: 'node' });
      expect(runMock).toHaveBeenCalledWith('npx tsc');
      expect(runMock).not.toHaveBeenCalledWith(expect.stringContaining('--outDir'));
    });
  });

  describe('build --minify', () => {
    test('minifies the emitted JavaScript in place', async () => {
      await scaffoldedProject();
      const source = [
        '// a comment that minification removes',
        'export function summarise(firstOperand, secondOperand) {',
        '  const intermediateTotal = firstOperand + secondOperand;',
        '  const intermediateProduct = firstOperand * secondOperand;',
        '  const intermediateDifference = firstOperand - secondOperand;',
        '  return {',
        '    total: intermediateTotal,',
        '    product: intermediateProduct,',
        '    difference: intermediateDifference,',
        '  };',
        '}',
        '',
      ].join('\n');
      runMock.mockImplementation(async (command: string) => {
        if (command.includes('--showConfig')) {
          return { stdout: JSON.stringify({ compilerOptions: { outDir: './dist' } }), stderr: '' };
        }
        await write('dist/src/index.js', source);
        await write(
          'dist/src/index.d.ts',
          'export declare function summarise(a: number, b: number): object;\n'
        );
        return { stdout: '', stderr: '' };
      });

      await new DevTools().buildProject({ target: 'node', minify: true });

      const minified = await read('dist/src/index.js');
      expect(minified.length).toBeLessThan(source.length);
      expect(minified).not.toContain('a comment');
      expect(minified).not.toContain('intermediateTotal');
      expect(minified).toContain('summarise');
      // Only JavaScript is rewritten.
      expect(await read('dist/src/index.d.ts')).toContain('export declare function summarise');

      // Without --minify the compiler's output is left as written.
      await new DevTools().buildProject({ target: 'node' });
      expect(await read('dist/src/index.js')).toBe(source);
    });
  });

  describe('lint', () => {
    const installEslint = async (version: string) => {
      await write('node_modules/.bin/eslint');
      await write('node_modules/eslint/package.json', JSON.stringify({ version }));
    };

    test('ESLint 9.0 - 9.20 is run without --ext, which it rejects', async () => {
      await installEslint('9.14.0');
      expect(eslintRejectsExtFlag(workDir)).toBe(true);

      await new DevTools().lintProject({ fix: true });

      expect(spawnMock).toHaveBeenCalledWith('npx', ['eslint', 'src', '--fix']);
    });

    test('ESLint 8.57 with a flat config file is run without --ext', async () => {
      await installEslint('8.57.1');
      await write('eslint.config.mjs', 'export default [];\n');
      expect(eslintRejectsExtFlag(workDir)).toBe(true);

      await new DevTools().lintProject({});
      expect(spawnMock).toHaveBeenCalledWith('npx', ['eslint', 'src']);

      // Where --ext is accepted it is still passed: ESLint 8 with an eslintrc
      // config, and ESLint 9.21+, which takes the flag again.
      await fs.rm(join(workDir, 'eslint.config.mjs'));
      expect(eslintRejectsExtFlag(workDir)).toBe(false);
      await installEslint('9.21.0');
      expect(eslintRejectsExtFlag(workDir)).toBe(false);

      spawnMock.mockClear();
      await new DevTools().lintProject({});
      expect(spawnMock).toHaveBeenCalledWith('npx', ['eslint', 'src', '--ext', '.ts,.js']);
    });
  });

  describe('test', () => {
    test('Jest runs with --experimental-vm-modules in an ES module package', async () => {
      await write('package.json', JSON.stringify({ name: 'app', type: 'module' }));
      await write('node_modules/.bin/jest');
      const original = process.env.NODE_OPTIONS;
      process.env.NODE_OPTIONS = '--max-old-space-size=512';

      try {
        await new DevTools().runTests({ coverage: true });

        const [command, args, options] = spawnMock.mock.calls[0];
        expect([command, args]).toEqual(['npx', ['jest', '--coverage']]);
        expect(options?.env?.NODE_OPTIONS).toBe(
          '--max-old-space-size=512 --experimental-vm-modules'
        );

        // A CommonJS package keeps its environment as it is.
        await write('package.json', JSON.stringify({ name: 'app' }));
        expect(jestEnvironment(workDir).NODE_OPTIONS).toBe('--max-old-space-size=512');
      } finally {
        if (original === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = original;
      }
    });
  });

  describe('security:scan', () => {
    const auditResult = (exitCode: number, stdout: string, stderr = '') => {
      execMock.mockImplementation((_cmd: string, _opts: unknown, callback: any) => {
        const error =
          exitCode === 0 ? null : Object.assign(new Error('failed'), { code: exitCode });
        callback(error, stdout, stderr);
      });
    };
    const printed = () =>
      (console.log as jest.Mock).mock.calls.map(call => String(call[0])).join('\n');

    beforeEach(() => {
      console.log = jest.fn();
    });

    test('prints the npm audit report when there is nothing to fix', async () => {
      auditResult(0, 'found 0 vulnerabilities\n');

      await expect(new DevTools().securityScan()).resolves.toBeUndefined();

      expect(execMock.mock.calls[0][0]).toBe('npm audit');
      expect(printed()).toContain('found 0 vulnerabilities');
    });

    test('prints the report and reports vulnerabilities as vulnerabilities', async () => {
      const report = 'lodash  <4.17.21\nSeverity: high\n\n3 vulnerabilities (1 low, 2 high)\n';
      auditResult(1, report);

      await expect(new DevTools().securityScan()).rejects.toThrow(
        /npm audit found vulnerable dependencies/
      );

      expect(printed()).toContain('3 vulnerabilities (1 low, 2 high)');
      expect(printed()).toContain('Severity: high');
    });

    test('says so when npm audit itself could not run', async () => {
      auditResult(
        1,
        '',
        'npm error code ENOLOCK\nnpm error audit This command requires an existing lockfile.\n'
      );

      await expect(new DevTools().securityScan()).rejects.toThrow(/npm audit could not complete/);

      expect(printed()).toContain('ENOLOCK');
    });
  });
});
