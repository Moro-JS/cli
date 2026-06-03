// Scaffold output tests – verify what initializeProject actually writes to disk.
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProjectInitializer } from '../../src/commands/init';

describe('ProjectInitializer scaffold output', () => {
  let workDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workDir = await fs.mkdtemp(join(tmpdir(), 'moro-scaffold-'));
    process.chdir(workDir);
    // Keep the scaffold banner/boxen noise out of the test output.
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    jest.restoreAllMocks();
    await fs.rm(workDir, { recursive: true, force: true });
  });

  const read = (project: string, ...parts: string[]) =>
    fs.readFile(join(workDir, project, ...parts), 'utf8');

  const exists = async (project: string, ...parts: string[]) => {
    try {
      await fs.access(join(workDir, project, ...parts));
      return true;
    } catch {
      return false;
    }
  };

  async function scaffold(name: string, features: string): Promise<void> {
    await new ProjectInitializer().initializeProject(name, {
      features,
      skipGit: true,
      skipInstall: true,
    });
  }

  describe('routes folder', () => {
    test('generates a top-level welcome route and a health subfolder route', async () => {
      await scaffold('routes-app', 'cors,compression');

      // Top-level route file holds the welcome/root route.
      expect(await exists('routes-app', 'src', 'routes', 'index.ts')).toBe(true);
      const root = await read('routes-app', 'src', 'routes', 'index.ts');
      expect(root).toContain('const app = getApp();');
      expect(root).toContain(`app.get('/')`);
      expect(root).not.toContain(`app.get('/health')`);

      // Health lives in its own subfolder to demonstrate the folder layout.
      expect(await exists('routes-app', 'src', 'routes', 'health', 'index.ts')).toBe(true);
      const health = await read('routes-app', 'src', 'routes', 'health', 'index.ts');
      expect(health).toContain('const app = getApp();');
      expect(health).toContain(`app.get('/health')`);
    });

    test('node relies on automatic file-based routing (no explicit wiring)', async () => {
      await scaffold('routes-app2', 'cors');

      const index = await read('routes-app2', 'src', 'index.ts');
      // Routes auto-load from ./src/routes (config.routing is on by default), so
      // index.ts wires nothing — no loadRoutes, no registerRoutes, no path utils.
      expect(index).not.toContain('loadRoutes');
      expect(index).not.toContain('registerRoutes');
      expect(index).not.toContain(`from 'node:path'`);

      // The route file self-registers via getApp() so the auto-loader picks it up.
      const routes = await read('routes-app2', 'src', 'routes', 'index.ts');
      expect(routes).toContain('const app = getApp();');
    });

    test('serverless runtimes statically register routes (no filesystem scan)', async () => {
      await new ProjectInitializer().initializeProject('edge-routes', {
        features: 'cors',
        runtime: 'vercel-edge',
        skipGit: true,
        skipInstall: true,
      });

      const index = await read('edge-routes', 'src', 'index.ts');
      expect(index).toContain(`import { registerRoutes } from './routes/index.js';`);
      expect(index).toContain('registerRoutes(app);');
      expect(index).not.toContain('loadRoutes');

      // Root registrar registers welcome and fans out to the health subfolder.
      const root = await read('edge-routes', 'src', 'routes', 'index.ts');
      expect(root).toContain('export function registerRoutes(app: any)');
      expect(root).toContain(
        `import { registerRoutes as registerHealthRoutes } from './health/index.js';`
      );
      expect(root).toContain('registerHealthRoutes(app);');

      const health = await read('edge-routes', 'src', 'routes', 'health', 'index.ts');
      expect(health).toContain('export function registerRoutes(app: any)');
      expect(health).toContain(`app.get('/health')`);
    });
  });

  describe('app creation', () => {
    test('uses createApp() with no redundant options, reading config via getConfig', async () => {
      await scaffold('createapp', 'cors,compression');

      const index = await read('createapp', 'src', 'index.ts');
      expect(index).toContain('const app = await createApp();');
      expect(index).toContain('const appConfig = app.getConfig();');
      // cors/compression/logging come from moro.config.ts, not inline options.
      expect(index).not.toContain('initializeConfig');
      expect(index).not.toContain('cors: true');
      expect(index).not.toContain('compression: true');
    });
  });

  describe('feature gating', () => {
    test('does not leak auth or docs when those features are not selected', async () => {
      await scaffold('plain-app', 'cors,compression');

      const index = await read('plain-app', 'src', 'index.ts');
      // No inline auth endpoints or auth middleware wiring.
      expect(index).not.toContain('/auth/login');
      expect(index).not.toContain('setupAuth');
      // No docs wiring when the docs feature is off.
      expect(index).not.toContain('enableDocs');

      const routes = await read('plain-app', 'src', 'routes', 'index.ts');
      // Welcome endpoint only advertises endpoints the app actually serves.
      expect(routes).toContain(`health: '/health'`);
      expect(routes).not.toContain(`docs: '/docs'`);
      expect(routes).not.toContain('/api/auth/login');

      // Auth middleware file should not exist either.
      expect(await exists('plain-app', 'src', 'middleware', 'auth.ts')).toBe(false);
    });

    test('wires auth + docs only when those features are selected', async () => {
      await scaffold('full-app', 'auth,docs,cors');

      const index = await read('full-app', 'src', 'index.ts');
      expect(index).toContain('setupAuth');
      expect(index).toContain('enableDocs');

      const routes = await read('full-app', 'src', 'routes', 'index.ts');
      // Welcome advertises the real endpoints setupAuth registers.
      expect(routes).toContain(`login: '/api/auth/login'`);
      expect(routes).toContain(`docs: '/docs'`);

      expect(await exists('full-app', 'src', 'middleware', 'auth.ts')).toBe(true);
    });
  });

  describe('moro.config.ts + tsconfig type-safety', () => {
    test('config uses a type-only import and DeepPartial annotation (not a value import / as-cast)', async () => {
      await scaffold('cfg-app', 'cors,compression');

      const cfg = await read('cfg-app', 'moro.config.ts');
      // Value import of a type breaks under verbatimModuleSyntax (TS1484).
      expect(cfg).toContain(`import type { AppConfig, DeepPartial } from '@morojs/moro';`);
      expect(cfg).not.toContain(`import { AppConfig }`);
      // Annotation catches real mismatches; the old `as` cast hid them.
      expect(cfg).toContain('const moroConfig: DeepPartial<AppConfig> = {');
      expect(cfg).toContain('export default moroConfig;');
      expect(cfg).not.toContain('as Partial<AppConfig>');
    });

    test('tsconfig explicitly loads node types so process.env resolves', async () => {
      await scaffold('cfg-app2', 'cors');

      const tsconfig = JSON.parse(await read('cfg-app2', 'tsconfig.json'));
      expect(tsconfig.compilerOptions.types).toEqual(['node']);
    });

    test('env-derived union values are cast to their literal types', async () => {
      await scaffold('cfg-app3', 'cache,rate-limit');

      const cfg = await read('cfg-app3', 'moro.config.ts');
      expect(cfg).toContain(`'debug' | 'info' | 'warn' | 'error' | 'fatal'`);
      expect(cfg).toContain(`'json' | 'pretty' | 'compact'`);
      expect(cfg).toContain(`'lru' | 'lfu' | 'fifo'`);
      // security.rateLimit must be nested under `global`.
      expect(cfg).toContain('rateLimit: {');
      expect(cfg).toContain('global: {');
    });

    test('redis database block is valid (no leading-comma syntax error)', async () => {
      await new ProjectInitializer().initializeProject('redis-app', {
        features: 'cache',
        database: 'redis',
        skipGit: true,
        skipInstall: true,
      });

      const cfg = await read('redis-app', 'moro.config.ts');
      expect(cfg).not.toContain('database: {,');
      expect(cfg).toContain('redis: {');
    });
  });
});
