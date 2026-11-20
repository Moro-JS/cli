// config init / config env – the generated moro.config.ts and .env.example.
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigManager } from '../../src/commands/config';

describe('ConfigManager', () => {
  let workDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workDir = await fs.mkdtemp(join(tmpdir(), 'moro-config-'));
    process.chdir(workDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(workDir, { recursive: true, force: true });
  });

  const read = (file: string) => fs.readFile(join(workDir, file), 'utf8');

  // The generated file only depends on process.env; transpile and evaluate it.
  function evaluate(source: string): any {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ts = require('typescript') as typeof import('typescript');
    const result = ts.transpileModule(source, {
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    expect(result.diagnostics).toEqual([]);
    const mod: { exports: any } = { exports: {} };
    new Function('module', 'exports', 'process', result.outputText)(mod, mod.exports, { env: {} });
    return mod.exports.default;
  }

  describe('config env', () => {
    test('.env.example carries no usable signing secret', async () => {
      await new ConfigManager().generateEnvTemplate({ environment: 'production' });

      const env = await read('.env.example');
      // The command tells the user to copy this file to .env, so a filled-in
      // example value would become the live secret.
      expect(env).toMatch(/^JWT_SECRET=$/m);
      expect(env).not.toContain('your-super-secret-jwt-key-change-this-in-production');
    });

    test('names the MySQL user variable the framework configuration reads', async () => {
      await new ConfigManager().generateEnvTemplate({ environment: 'development' });

      const env = await read('.env.example');
      expect(env).toMatch(/^MYSQL_USERNAME=$/m);
      expect(env).not.toMatch(/^MYSQL_USER=/m);
    });
  });

  describe('config init', () => {
    test('imports AppConfig as a type so the file compiles under verbatimModuleSyntax', async () => {
      await new ConfigManager().initializeConfig({ environment: 'development' });

      const config = await read('moro.config.ts');
      expect(config).toContain(`import type { AppConfig } from '@morojs/moro';`);
    });

    test.each(['vercel-edge', 'aws-lambda', 'cloudflare-workers'])(
      '--runtime=%s leaves out the settings only a long-running server has',
      async runtime => {
        await new ConfigManager().initializeConfig({ environment: 'production', runtime });

        const config = await read('moro.config.ts');
        expect(config).toContain(`// Runtime: ${runtime}`);
        expect(config).not.toContain('maxConnections');
        expect(config).not.toContain('clustering');
        expect(config).not.toMatch(/^\s*timeout: 30000/m);
        expect(config).not.toContain('timeouts');
        // The rest of the file is unchanged, and what is left is a valid object.
        expect(config).toContain('circuitBreaker: {');
        expect(config).toContain(`bodySizeLimit: '10mb'`);
        const serverless = evaluate(config);
        expect(serverless.server.port).toBe(3000);
        expect(serverless.performance.clustering).toBeUndefined();
        expect(serverless.performance.compression.enabled).toBe(true);

        // The node runtime, and no --runtime at all, keep the server settings.
        for (const serverRuntime of [undefined, 'node']) {
          await new ConfigManager().initializeConfig({
            environment: 'production',
            runtime: serverRuntime,
          });
          const server = evaluate(await read('moro.config.ts'));
          expect(server.server.maxConnections).toBe(1000);
          expect(server.performance.clustering).toEqual({ enabled: true, workers: 'auto' });
        }
      }
    );
  });

  describe('config init: request timeout', () => {
    const write = async (file: string, content: string) => {
      await fs.mkdir(join(workDir, file, '..'), { recursive: true });
      await fs.writeFile(join(workDir, file), content);
    };
    const installFramework = (version: string) =>
      write(
        'node_modules/@morojs/moro/package.json',
        JSON.stringify({ name: '@morojs/moro', version })
      );
    const declareFramework = (range: string) =>
      write(
        'package.json',
        JSON.stringify({ name: 'app', dependencies: { '@morojs/moro': range } })
      );

    async function generatedServer(): Promise<any> {
      await new ConfigManager().initializeConfig({ environment: 'production' });
      return evaluate(await read('moro.config.ts')).server;
    }
    const newForm = { timeouts: { request: 30000 }, timeout: undefined };
    const oldForm = { timeouts: undefined, timeout: 30000 };
    const form = (server: any) => ({ timeouts: server.timeouts, timeout: server.timeout });

    test('writes server.timeouts.request when nothing says which framework the project uses', async () => {
      expect(form(await generatedServer())).toEqual(newForm);
    });

    test.each([
      ['1.8.0', newForm],
      ['1.8.25', newForm],
      ['2.0.0', newForm],
      ['1.7.30', oldForm],
      ['1.6.4', oldForm],
    ])('with @morojs/moro %s installed', async (version, expected) => {
      await installFramework(version);

      expect(form(await generatedServer())).toEqual(expected);
    });

    test.each([
      ['^1.8.3', newForm],
      ['latest', newForm],
      ['file:../MoroJS', newForm],
      ['^1.7.28', oldForm],
      ['>=1.7.0', oldForm],
    ])('with @morojs/moro declared as %s and not installed', async (range, expected) => {
      await declareFramework(range);

      expect(form(await generatedServer())).toEqual(expected);
    });

    test('the installed version decides over the declared range', async () => {
      await declareFramework('^1.7.28');
      await installFramework('1.8.2');
      expect(form(await generatedServer())).toEqual(newForm);

      await declareFramework('latest');
      await installFramework('1.7.30');
      expect(form(await generatedServer())).toEqual(oldForm);
    });
  });

  describe('config init: trustProxy', () => {
    const typings = join('node_modules', '@morojs', 'moro', 'dist', 'types', 'config.d.ts');
    const installTypings = async (content: string) => {
      await fs.mkdir(join(workDir, typings, '..'), { recursive: true });
      await fs.writeFile(join(workDir, typings), content);
    };
    const offered =
      /host: [^\n]+\n\s+\/\/ Behind a load balancer or reverse proxy, set this: [^\n]+\n\s+\/\/ trustProxy: 1,\n/;

    async function generated(): Promise<string> {
      await new ConfigManager().initializeConfig({ environment: 'production' });
      return read('moro.config.ts');
    }

    test('is offered as a commented line, and no value is set', async () => {
      const config = await generated();

      expect(config).toMatch(offered);
      expect(config).toContain('Leave it unset when the app is reached directly.');
      expect(evaluate(config).server.trustProxy).toBeUndefined();
    });

    test('is offered when the installed framework has the setting', async () => {
      await installTypings('export interface ServerConfig { trustProxy?: boolean | number; }');

      expect(await generated()).toMatch(offered);
    });

    test('is left out when the installed framework does not have the setting', async () => {
      await installTypings('export interface ServerConfig { port: number; }');

      const config = await generated();
      expect(config).not.toContain('trustProxy');
      expect(evaluate(config).server.port).toBe(3000);
    });
  });

  describe('config validate', () => {
    test('loads a TypeScript config that imports a helper with a .js specifier', async () => {
      // TypeScript-only syntax, and the import form an ES module project uses
      // for its own .ts files: neither can be loaded by importing the file as is.
      await fs.mkdir(join(workDir, 'settings'), { recursive: true });
      await fs.writeFile(
        join(workDir, 'settings', 'ports.ts'),
        'export enum Ports {\n  Http = 4100,\n}\n'
      );
      await fs.writeFile(
        join(workDir, 'moro.config.ts'),
        [
          `import { Ports } from './settings/ports.js';`,
          `interface Shape { server: { port: number; host: string }; logging: object; security: object; performance: object }`,
          `const config: Shape = {`,
          `  server: { port: Ports.Http, host: 'localhost' },`,
          `  logging: { level: 'info' },`,
          `  security: {},`,
          `  performance: {},`,
          `};`,
          `export default config;`,
          '',
        ].join('\n')
      );

      const manager = new ConfigManager();
      const logged: string[] = [];
      const record = (message: string) => logged.push(message);
      (manager as any).logger = { info: record, warn: record, error: record, debug: record };

      await manager.validateConfig();

      expect(logged.join('\n')).toContain('Configuration validation passed');
      expect(logged.join('\n')).not.toContain('Invalid configuration');
      // Nothing is left behind next to the config file.
      expect((await fs.readdir(workDir)).sort()).toEqual(['moro.config.ts', 'settings']);

      // A config that loads but is wrong is still reported as such.
      await fs.writeFile(
        join(workDir, 'moro.config.ts'),
        [
          `import { Ports } from './settings/ports.js';`,
          `const port: string = String(Ports.Http);`,
          `export default { server: { port, host: 'localhost' }, logging: {}, security: {} };`,
          '',
        ].join('\n')
      );
      logged.length = 0;
      await manager.validateConfig();
      expect(logged.join('\n')).toContain('server.port must be a number');
      expect(logged.join('\n')).toContain('Missing required section: performance');
    });
  });
});
