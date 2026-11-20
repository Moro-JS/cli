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
      expect(routes).not.toContain('/api/auth/');
      expect(routes).not.toContain('/api/profile');

      // Auth middleware file should not exist either.
      expect(await exists('plain-app', 'src', 'middleware', 'auth.ts')).toBe(false);
    });

    test('wires auth + docs only when those features are selected', async () => {
      await scaffold('full-app', 'auth,docs,cors');

      const index = await read('full-app', 'src', 'index.ts');
      expect(index).toContain('setupAuth');
      expect(index).toContain('enableDocs');

      const routes = await read('full-app', 'src', 'routes', 'index.ts');
      // Welcome advertises the endpoints setupAuth serves: Better Auth's sign-in
      // routes and the guarded profile route.
      expect(routes).toContain(`signUp: '/api/auth/sign-up/email'`);
      expect(routes).toContain(`signIn: '/api/auth/sign-in/email'`);
      expect(routes).toContain(`signOut: '/api/auth/sign-out'`);
      expect(routes).toContain(`session: '/api/auth/get-session'`);
      expect(routes).toContain(`profile: '/api/profile'`);
      // Routes of the hand-written JWT login the scaffold used to generate.
      expect(routes).not.toMatch(/\/api\/auth\/(login|logout|status)/);
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

    test('the request timeout is written as server.timeouts.request', async () => {
      await scaffold('cfg-timeouts', 'cors');

      const cfg = await read('cfg-timeouts', 'moro.config.ts');
      expect(cfg).toMatch(
        /timeouts: \{\n\s+\/\/ [^\n]+\n\s+request: parseInt\(process\.env\.REQUEST_TIMEOUT/
      );
      // server.timeout is the older spelling of the same setting.
      expect(cfg).not.toMatch(/^\s*timeout: parseInt\(process\.env\.REQUEST_TIMEOUT/m);
    });

    test('trustProxy is offered as a commented line in the server block, with no value set', async () => {
      await scaffold('cfg-proxy', 'cors');

      const cfg = await read('cfg-proxy', 'moro.config.ts');
      expect(cfg).toMatch(
        /host: [^\n]+\n\s+\/\/ Behind a load balancer or reverse proxy, set this: [^\n]+\n\s+\/\/ trustProxy: 1,\n/
      );
      expect(cfg).toContain('Leave it unset when the app is reached directly.');
      expect(cfg).not.toMatch(/^\s*trustProxy:/m);
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

  describe('auth secret + accounts', () => {
    const PLACEHOLDER = 'your-super-secret-jwt-key-change-this-in-production';
    const envSecret = (env: string) => /^AUTH_SECRET=(.*)$/m.exec(env)?.[1];

    test('.env gets a random secret; .env.example keeps an empty placeholder', async () => {
      await scaffold('secret-a', 'auth');
      await scaffold('secret-b', 'auth');

      const secretA = envSecret(await read('secret-a', '.env'));
      const secretB = envSecret(await read('secret-b', '.env'));
      // crypto.randomBytes(32).toString('hex')
      expect(secretA).toMatch(/^[0-9a-f]{64}$/);
      expect(secretB).toMatch(/^[0-9a-f]{64}$/);
      // Every scaffold gets its own secret.
      expect(secretA).not.toBe(secretB);

      const example = await read('secret-a', '.env.example');
      expect(envSecret(example)).toBe('');
      expect(example).not.toContain(secretA as string);
    });

    test('generated code has no fallback secret and reads it through one helper', async () => {
      await scaffold('secret-code', 'auth');

      const authSrc = await read('secret-code', 'src', 'middleware', 'auth.ts');
      expect(authSrc).not.toContain(PLACEHOLDER);
      expect(authSrc).not.toMatch(/process\.env\.AUTH_SECRET/);
      expect(authSrc).toContain(`import { getAuthSecret } from './auth-secret.js';`);
      // Resolved once at the top of setupAuth so a bad secret stops the boot.
      expect(authSrc).toMatch(
        /export async function setupAuth\(app: any\): Promise<void> \{\n(\s*\/\/.*\n)*\s*const secret = getAuthSecret\(\);/
      );
      expect(authSrc.match(/getAuthSecret\(\)/g)).toHaveLength(2); // comment + call

      const helper = await read('secret-code', 'src', 'middleware', 'auth-secret.ts');
      expect(helper).toContain('export function getAuthSecret(): string');
      expect(helper).not.toMatch(/AUTH_SECRET\s*(\|\||\?\?)/);

      // No other generated file carries the old literal.
      for (const file of ['.env', '.env.example', 'moro.config.ts', 'src/index.ts']) {
        expect(await read('secret-code', ...file.split('/'))).not.toContain(PLACEHOLDER);
      }
    });

    test('the generated helper throws when AUTH_SECRET is unset or a placeholder', async () => {
      await scaffold('secret-helper', 'auth');

      // The helper is dependency-free TypeScript; transpile and evaluate it.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ts = require('typescript') as typeof import('typescript');
      const js = ts.transpileModule(
        await read('secret-helper', 'src', 'middleware', 'auth-secret.ts'),
        { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
      ).outputText;
      const mod: { exports: { getAuthSecret?: () => string } } = { exports: {} };
      new Function('module', 'exports', js)(mod, mod.exports);
      const getAuthSecret = mod.exports.getAuthSecret as () => string;

      const original = process.env.AUTH_SECRET;
      try {
        delete process.env.AUTH_SECRET;
        expect(() => getAuthSecret()).toThrow(/AUTH_SECRET is not set/);
        process.env.AUTH_SECRET = '   ';
        expect(() => getAuthSecret()).toThrow(/AUTH_SECRET is not set/);
        process.env.AUTH_SECRET = PLACEHOLDER;
        expect(() => getAuthSecret()).toThrow(/known placeholder/);

        const generated = envSecret(await read('secret-helper', '.env')) as string;
        process.env.AUTH_SECRET = generated;
        expect(getAuthSecret()).toBe(generated);
      } finally {
        if (original === undefined) delete process.env.AUTH_SECRET;
        else process.env.AUTH_SECRET = original;
      }
    });

    test('no account is built into the generated code', async () => {
      await scaffold('no-account', 'auth');

      // Users live in Better Auth's store and are created by signing up, so the
      // generated project carries no address or password of its own.
      for (const file of ['src/middleware/auth.ts', 'src/middleware/auth-secret.ts', 'README.md']) {
        const source = await read('no-account', ...file.split('/'));
        expect(source).not.toContain('admin@example.com');
        expect(source).not.toContain('DEVELOPMENT PLACEHOLDER');
        expect(source).not.toContain('findUserByEmail');
        expect(source).not.toMatch(/password:\s*['"`]/);
      }
    });
  });

  describe('authentication on Better Auth', () => {
    const WIRED = ['sqlite', 'postgresql', 'mysql'] as const;
    const IN_MEMORY = ['none', 'mongodb', 'redis', 'drizzle'] as const;
    const ALL = [...WIRED, ...IN_MEMORY];

    async function scaffoldAuth(name: string, database: string, runtime = 'node'): Promise<void> {
      await new ProjectInitializer().initializeProject(name, {
        features: 'auth',
        database,
        runtime,
        skipGit: true,
        skipInstall: true,
      } as any);
    }

    const authSource = (name: string) => read(name, 'src', 'middleware', 'auth.ts');

    // The file without its comments: what is compiled.
    const code = (source: string) =>
      source
        .split('\n')
        .filter(line => !line.trim().startsWith('//'))
        .join('\n');

    // Names a file imports from the framework, type-only imports included.
    const frameworkImports = (source: string): string[] =>
      [...source.matchAll(/import (?:type )?\{([^}]+)\} from '@morojs\/moro';/g)]
        .flatMap(match => match[1].split(','))
        .map(name => name.trim())
        .filter(Boolean);

    // Packages a file imports from node_modules.
    const packageImports = (source: string): string[] =>
      [...source.matchAll(/from '([^'.][^']*)'/g)]
        .map(match => match[1])
        .map(spec => (spec.startsWith('@') ? spec.split('/').slice(0, 2) : [spec.split('/')[0]]))
        .map(parts => parts.join('/'));

    test.each(ALL)('%s: none of the keys Better Auth has no equivalent for', async database => {
      await scaffoldAuth(`keys-${database}`, database);

      const source = code(await authSource(`keys-${database}`));
      // Each of these is named in a start-up warning by the framework's adapter.
      expect(source).not.toContain('providers.credentials');
      expect(source).not.toMatch(/\bcallbacks\s*:/);
      expect(source).not.toMatch(/\bstrategy\s*:/);
      expect(source).not.toMatch(/\b(events|pages|adapter|cookies|trustHost|theme|jwt)\s*:/);
      // The hand-written JWT login and its packages.
      expect(source).not.toMatch(/bcrypt|jsonwebtoken|jwt\.(sign|verify)|auth-token/);
    });

    test.each(ALL)('%s: sign-in is set up with the options the adapter takes', async database => {
      await scaffoldAuth(`api-${database}`, database);

      const source = code(await authSource(`api-${database}`));
      expect(frameworkImports(source)).toEqual(
        expect.arrayContaining([
          'createAuthMiddleware',
          'bearerToken',
          'providers',
          'requireAuth',
          'requireAdmin',
          'AuthProvider',
        ])
      );
      expect(source).toContain('await app.use(createAuthMiddleware(authConfig));');
      // Email and password is Better Auth's own option, passed through.
      expect(source).toMatch(/betterAuth: \{[\s\S]*emailAndPassword: \{ enabled: true \}/);
      expect(source).toMatch(/session: \{\s+maxAge: 8 \* 60 \* 60/);
      expect(source).toContain('plugins: [bearerToken()]');
      expect(source).toContain('providers: oauthProviders()');
      // The role the admin guard reads cannot be set by a sign-up.
      expect(source).toMatch(/roles: \{ type: 'string', defaultValue: 'user', input: false \}/);
      // The guarded routes use the framework's guards.
      expect(source).toMatch(/app\.get\('\/api\/profile'\)[\s\S]*?\.before\(requireAuth\(\)\)/);
      expect(source).toMatch(/app\.get\('\/api\/admin'\)[\s\S]*?\.before\(requireAdmin\(\)\)/);
    });

    test.each(ALL)('%s: the generated file is valid TypeScript', async database => {
      await scaffoldAuth(`syntax-${database}`, database);

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ts = require('typescript') as typeof import('typescript');
      const result = ts.transpileModule(await authSource(`syntax-${database}`), {
        reportDiagnostics: true,
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      expect(result.diagnostics).toEqual([]);
    });

    test('an OAuth provider is configured only when both of its variables are set', async () => {
      await scaffoldAuth('oauth-app', 'none');

      // oauthProviders() depends on process.env and `providers` only: evaluate it.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ts = require('typescript') as typeof import('typescript');
      const source = await authSource('oauth-app');
      const start = source.indexOf('function oauthProviders()');
      const end = source.indexOf('export async function setupAuth');
      expect(start).toBeGreaterThan(-1);
      const js = ts.transpileModule(source.slice(start, end), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText;
      const providers = {
        github: (options: object) => ({ id: 'github', ...options }),
        google: (options: object) => ({ id: 'google', ...options }),
      };
      const configuredWith = (env: Record<string, string>) =>
        new Function('providers', 'process', `${js}; return oauthProviders();`)(providers, { env });

      expect(configuredWith({})).toEqual([]);
      // Blank values, as .env has them until they are filled in.
      expect(configuredWith({ GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '' })).toEqual([]);
      // An id without its secret would be refused by the adapter with a warning.
      expect(configuredWith({ GITHUB_CLIENT_ID: 'id' })).toEqual([]);
      expect(
        configuredWith({
          GITHUB_CLIENT_ID: 'gh-id',
          GITHUB_CLIENT_SECRET: 'gh-secret',
          GOOGLE_CLIENT_ID: 'g-id',
          GOOGLE_CLIENT_SECRET: 'g-secret',
        })
      ).toEqual([
        { id: 'github', clientId: 'gh-id', clientSecret: 'gh-secret' },
        { id: 'google', clientId: 'g-id', clientSecret: 'g-secret' },
      ]);
    });

    test.each([
      ['sqlite', 'SQLite'],
      ['postgresql', 'PostgreSQL'],
      ['mysql', 'MySQL'],
    ])('%s: sign-in uses the connection of src/database/index.ts', async (database, label) => {
      await scaffoldAuth(`wired-${database}`, database);

      const source = await authSource(`wired-${database}`);
      // The requirement, and what happens without the connection, are stated.
      expect(source).toContain('// The database. Better Auth keeps users, password hashes and');
      expect(source).toContain(`${label} connection`);
      expect(source).toMatch(/does not start if\n?\/\/ ?NODE_ENV is production/);
      expect(source).toMatch(/everything is gone at\n?\/\/ ?restart/);

      const compiled = code(source);
      // Only what setupDatabase() stored counts: without it, app.database is
      // the framework's own database() method, not a connection.
      expect(compiled).toContain(
        `const connection = Object.hasOwn(app, 'database') ? app.database : undefined;`
      );
      expect(compiled).toMatch(/database:\s+connection \?\? memoryAdapter\(/);
      // Without the connection: no start in production, a warning elsewhere.
      expect(compiled).toMatch(
        /if \(!connection\) \{\s+if \(process\.env\.NODE_ENV === 'production'\) \{\s+throw new Error\(/
      );
      expect(compiled).toMatch(/logger\.warn\(\s+'No database connection/);
      // The tables are created from the configuration Better Auth runs with.
      expect(frameworkImports(compiled)).toContain('MoroJSAuth');
      expect(compiled).toContain(`import { getMigrations } from 'better-auth/db/migration';`);
      expect(compiled).toMatch(
        /if \(connection\) \{\s+const \{ instance \} = await MoroJSAuth\(authConfig\);\s+const \{ runMigrations \} = await getMigrations\(instance\.options\);\s+await runMigrations\(\);/
      );
      // setupDatabase() runs first, so app.database is there when setupAuth() reads it.
      const index = await read(`wired-${database}`, 'src', 'index.ts');
      expect(index.indexOf('await setupDatabase(app);')).toBeGreaterThan(-1);
      expect(index.indexOf('await setupAuth(app);')).toBeGreaterThan(
        index.indexOf('await setupDatabase(app);')
      );

      const readme = await read(`wired-${database}`, 'README.md');
      expect(readme).toContain(`This project uses the ${label} connection opened in`);
      expect(readme).toContain('the app does not start if `NODE_ENV` is `production`');
      expect(readme).toContain('a production start stops when sign-in has no connection');
    });

    test.each([
      ['none', 'scaffolded without a database'],
      ['mongodb', 'uses MongoDB'],
      ['redis', 'uses Redis'],
      ['drizzle', 'uses Drizzle'],
    ])('%s: sign-in starts on the in-memory store and says so', async (database, reason) => {
      await scaffoldAuth(`memory-${database}`, database);

      const source = await authSource(`memory-${database}`);
      const comments = source
        .split('\n')
        .filter(line => line.startsWith('//'))
        .map(line => line.replace(/^\/\/ ?/, ''))
        .join(' ');
      expect(comments).toContain('email and password sign-in needs one');
      expect(comments).toContain(reason);
      expect(comments).toContain(
        'everything is gone at restart, and nothing is shared between processes'
      );
      expect(comments).toContain('https://better-auth.com/docs/concepts/database');

      const compiled = code(source);
      expect(compiled).toMatch(/database: memoryAdapter\(\{ user: \[\], session: \[\]/);
      // Nothing of the project's own database is assumed.
      expect(compiled).not.toContain('app.database');
      expect(compiled).not.toContain('getMigrations');
      expect(frameworkImports(compiled)).not.toContain('MoroJSAuth');
      // Production is told at start-up that users do not survive a restart.
      expect(compiled).toMatch(
        /if \(process\.env\.NODE_ENV === 'production'\) \{\s+logger\.warn\(/
      );

      const readme = await read(`memory-${database}`, 'README.md');
      expect(readme).toContain(reason);
      expect(readme).toContain("sign-in starts on Better Auth's in-memory store");
      expect(readme).not.toContain('a production start stops when sign-in has no connection');
    });

    test.each([
      ['node', 'sqlite'],
      ['node', 'none'],
      ['vercel-edge', 'none'],
      ['aws-lambda', 'postgresql'],
    ])('%s / %s: generated packages are the ones the auth files import', async (runtime, db) => {
      const name = `packages-${runtime}-${db}`;
      await scaffoldAuth(name, db, runtime);

      const pkg = JSON.parse(await read(name, 'package.json'));
      const installed = { ...pkg.dependencies, ...pkg.devDependencies };

      expect(pkg.dependencies['better-auth']).toBe('^1.7.7');
      // Packages of the hand-written JWT login; nothing generated imports them.
      for (const gone of ['bcryptjs', 'jsonwebtoken', '@types/bcryptjs', '@types/jsonwebtoken']) {
        expect(installed[gone]).toBeUndefined();
      }

      const imported = [
        ...packageImports(await authSource(name)),
        ...packageImports(await read(name, 'src', 'middleware', 'auth-secret.ts')),
      ];
      expect(imported).toEqual(expect.arrayContaining(['@morojs/moro', 'better-auth']));
      for (const dependency of imported) {
        expect(pkg.dependencies[dependency]).toBeDefined();
      }
    });

    test('.env carries what sign-in reads, and .env.example the same keys without values', async () => {
      await scaffoldAuth('auth-env', 'sqlite');

      const env = await read('auth-env', '.env');
      const example = await read('auth-env', '.env.example');
      const source = await authSource('auth-env');

      expect(env).toMatch(/^BASE_URL=http:\/\/localhost:3000$/m);
      // Every variable oauthProviders() destructures is there, blank.
      const names = /const \{([^}]+)\} =\s+process\.env;/.exec(source)?.[1].split(',') ?? [];
      expect(names.map(name => name.trim())).toEqual([
        'GITHUB_CLIENT_ID',
        'GITHUB_CLIENT_SECRET',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
      ]);
      for (const name of names.map(entry => entry.trim())) {
        expect(env).toMatch(new RegExp(`^${name}=$`, 'm'));
        expect(example).toMatch(new RegExp(`^${name}=$`, 'm'));
      }
      expect(example).toMatch(/^BASE_URL=$/m);
      // Settings nothing in the generated project reads.
      expect(env).not.toMatch(/JWT_EXPIRES_IN|BCRYPT_ROUNDS/);

      // .env.example is .env with the values removed: its comments are intact.
      const comments = (text: string) => text.split('\n').filter(line => line.startsWith('#'));
      expect(comments(example)).toEqual(comments(env));
    });

    test('docker-compose.yml passes the sign-in settings to the app', async () => {
      await scaffoldAuth('auth-compose', 'postgresql');

      const compose = await read('auth-compose', 'docker-compose.yml');
      expect(compose).toContain('      - AUTH_SECRET=${AUTH_SECRET}');
      expect(compose).toContain('      - BASE_URL=${BASE_URL:-http://localhost:3000}');
      expect(compose).toContain('      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-}');
      expect(compose).toContain('      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}');
    });

    test('the README documents the routes the generated file serves', async () => {
      await scaffoldAuth('auth-readme', 'sqlite');

      const readme = await read('auth-readme', 'README.md');
      const source = await authSource('auth-readme');
      const section = readme.slice(
        readme.indexOf('### Authentication'),
        readme.indexOf('### Production Setup')
      );

      expect(section).toContain('email and password sign-in needs one');
      for (const route of ['/api/profile', '/api/admin']) {
        expect(source).toContain(`app.get('${route}')`);
        expect(section).toContain(`\`GET ${route}\``);
      }
      for (const route of [
        'POST /api/auth/sign-up/email',
        'POST /api/auth/sign-in/email',
        'GET /api/auth/get-session',
        'POST /api/auth/sign-out',
      ]) {
        expect(section).toContain(`\`${route}\``);
      }
      for (const name of ['AUTH_SECRET', 'BASE_URL', 'GITHUB_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
        expect(section).toContain(`\`${name}\``);
      }
      // Routes of the hand-written JWT login the scaffold used to generate.
      expect(readme).not.toMatch(/\/api\/auth\/(login|logout|status)/);
      // The node runtime listens on localhost: the sample commands name it.
      expect(section).toContain(
        `curl -b cookies.txt -X POST -H 'Origin: http://localhost:3000' http://localhost:3000/api/auth/sign-out`
      );
    });

    test.each(['vercel-edge', 'aws-lambda', 'cloudflare-workers'])(
      '%s: the README commands take the URL of the deployment',
      async runtime => {
        await scaffoldAuth(`readme-${runtime}`, 'none', runtime);

        const readme = await read(`readme-${runtime}`, 'README.md');
        const section = readme.slice(
          readme.indexOf('### Authentication'),
          readme.indexOf('### Production Setup')
        );
        // These runtimes export a handler; nothing listens on localhost.
        expect(section).not.toContain('http://localhost:3000/api/');
        expect(section).toContain('APP_URL=https://your-app.example.com');
        expect(section).toContain('"$APP_URL/api/auth/sign-up/email"');
        expect(section).toContain(
          'curl -b cookies.txt -X POST -H "Origin: $APP_URL" "$APP_URL/api/auth/sign-out"'
        );
        expect(section).toContain(
          `Every instance of a ${runtime} deployment is a process of its own`
        );
      }
    );
  });

  describe('.env loading', () => {
    test('node scaffolds import dotenv/config before anything else', async () => {
      await scaffold('env-node', 'auth');

      const index = await read('env-node', 'src', 'index.ts');
      const firstImport = index.split('\n').find(line => line.startsWith('import '));
      expect(firstImport).toBe(`import 'dotenv/config';`);

      const pkg = JSON.parse(await read('env-node', 'package.json'));
      expect(pkg.dependencies.dotenv).toBeDefined();
      expect(pkg.scripts.dev).toBe('tsx watch src/index.ts');
    });

    test('non-node scaffolds preload .env in the dev script only', async () => {
      await new ProjectInitializer().initializeProject('env-edge', {
        features: 'auth',
        runtime: 'vercel-edge',
        skipGit: true,
        skipInstall: true,
      });

      // Deployed edge code must not import a filesystem loader.
      const index = await read('env-edge', 'src', 'index.ts');
      expect(index).not.toContain('dotenv');

      const pkg = JSON.parse(await read('env-edge', 'package.json'));
      expect(pkg.scripts.dev).toBe('tsx watch -r dotenv/config src/index.ts');
      expect(pkg.devDependencies.dotenv).toBeDefined();
      expect(pkg.dependencies.dotenv).toBeUndefined();
    });
  });

  describe('database setup', () => {
    const DATABASES = ['postgresql', 'mysql', 'mongodb', 'sqlite', 'redis', 'drizzle'] as const;

    async function scaffoldDb(name: string, database: (typeof DATABASES)[number]): Promise<void> {
      await new ProjectInitializer().initializeProject(name, {
        database,
        skipGit: true,
        skipInstall: true,
      });
    }

    // Module specifiers a generated file imports from node_modules.
    const packageImports = (source: string): string[] =>
      [...source.matchAll(/from '([^'.][^']*)'/g)]
        .map(match => match[1])
        .filter(spec => !spec.startsWith('node:'))
        .map(spec => (spec.startsWith('@') ? spec.split('/').slice(0, 2) : [spec.split('/')[0]]))
        .map(parts => parts.join('/'));

    // The three choices that used to get an empty src/database/index.ts.
    const FORMERLY_EMPTY = ['sqlite', 'redis', 'drizzle'] as const;

    test.each(FORMERLY_EMPTY)(
      '%s: src/database/index.ts exports the setupDatabase that src/index.ts imports',
      async database => {
        await scaffoldDb(`db-${database}`, database);

        const index = await read(`db-${database}`, 'src', 'index.ts');
        expect(index).toContain(`import { setupDatabase } from './database/index.js';`);

        const setup = await read(`db-${database}`, 'src', 'database', 'index.ts');
        expect(setup).toContain('export async function setupDatabase(app: any): Promise<void>');
      }
    );

    test.each(FORMERLY_EMPTY)(
      '%s: every package the setup file imports is installed',
      async database => {
        await scaffoldDb(`deps-${database}`, database);

        const setup = await read(`deps-${database}`, 'src', 'database', 'index.ts');
        const pkg = JSON.parse(await read(`deps-${database}`, 'package.json'));
        const installed = { ...pkg.dependencies, ...pkg.devDependencies };

        const imported = packageImports(setup);
        expect(imported.length).toBeGreaterThan(1);
        for (const name of imported) {
          expect(installed[name]).toBeDefined();
        }
      }
    );

    test.each(['postgresql', ...FORMERLY_EMPTY] as const)(
      '%s: every variable the setup file reads is written to .env',
      async database => {
        await scaffoldDb(`env-${database}`, database);

        const setup = await read(`env-${database}`, 'src', 'database', 'index.ts');
        const env = await read(`env-${database}`, '.env');
        const example = await read(`env-${database}`, '.env.example');

        const readNames = [...setup.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(match => match[1]);

        expect(readNames.length).toBeGreaterThan(0);
        for (const name of readNames) {
          expect(env).toMatch(new RegExp(`^${name}=`, 'm'));
          expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
        }
      }
    );

    test('mysql uses the user variable the framework configuration reads', async () => {
      await scaffoldDb('mysql-names', 'mysql');

      const env = await read('mysql-names', '.env');
      expect(env).toMatch(/^MYSQL_USERNAME=/m);
      expect(env).not.toMatch(/^MYSQL_USER=/m);

      // moro.config.ts and the setup file read the same name .env provides.
      expect(await read('mysql-names', 'moro.config.ts')).toContain('process.env.MYSQL_USERNAME');
      expect(await read('mysql-names', 'src', 'database', 'index.ts')).toContain(
        'process.env.MYSQL_USERNAME'
      );
    });
  });

  describe('Dockerfile', () => {
    test('runs the file the build produces and builds with devDependencies installed', async () => {
      await scaffold('docker-app', 'cors');

      const pkg = JSON.parse(await read('docker-app', 'package.json'));
      const dockerfile = await read('docker-app', 'Dockerfile');

      // CMD and the start script agree on the compiled entry.
      expect(pkg.scripts.start).toContain('dist/src/index.js');
      expect(dockerfile).toContain('CMD ["node", "dist/src/index.js"]');
      expect(dockerfile).not.toContain('CMD ["node", "dist/index.js"]');

      // The build needs typescript (a devDependency), so the install before it
      // must not be production-only. Dev packages are removed after the build.
      const buildAt = dockerfile.indexOf('RUN npm run build');
      const beforeBuild = dockerfile.slice(0, buildAt);
      expect(buildAt).toBeGreaterThan(-1);
      expect(beforeBuild).not.toMatch(/--only=production|--omit=dev|--production/);
      expect(dockerfile.indexOf('RUN npm prune --omit=dev')).toBeGreaterThan(buildAt);
    });

    test('keeps host node_modules and .env out of the build context', async () => {
      await scaffold('docker-ignore', 'auth');

      const ignored = (await read('docker-ignore', '.dockerignore')).split('\n');
      expect(ignored).toContain('node_modules');
      expect(ignored).toContain('.env');
    });

    test.each(['redis', 'drizzle', 'sqlite'] as const)(
      'docker-compose.yml for %s only depends on services it defines',
      async database => {
        await new ProjectInitializer().initializeProject(`compose-${database}`, {
          database,
          skipGit: true,
          skipInstall: true,
        });

        const compose = await read(`compose-${database}`, 'docker-compose.yml');
        // Top-level service names are the two-space indented keys under `services:`.
        const servicesBlock = compose.slice(
          compose.indexOf('services:'),
          compose.indexOf('\nvolumes:')
        );
        const services = [...servicesBlock.matchAll(/^ {2}([a-z_]+):$/gm)].map(match => match[1]);
        // Short form (`- name`) or long form (`name:` with a condition).
        const dependsOn = /depends_on:\n\s+(?:- )?([a-z_]+)/.exec(compose)?.[1];

        expect(services).toContain('app');
        if (database === 'sqlite') {
          expect(dependsOn).toBeUndefined();
        } else {
          expect(services).toContain(dependsOn);
        }
      }
    );
  });

  describe('CORS origin', () => {
    test('production reads its origins from CORS_ORIGIN and has no wildcard default', async () => {
      await scaffold('cors-app', 'cors');

      const cfg = await read('cors-app', 'moro.config.ts');
      expect(cfg).not.toMatch(/CORS_ORIGIN[^\n]*'\*'/);
      expect(cfg).toContain('corsOrigins.includes(requestOrigin)');

      expect(await read('cors-app', '.env')).toMatch(/^CORS_ORIGIN=$/m);
      expect(await read('cors-app', '.env.example')).toMatch(/^CORS_ORIGIN=$/m);
    });

    test('the generated cors block allows any origin in development and only listed ones in production', async () => {
      await scaffold('cors-eval', 'cors');

      // moro.config.ts only depends on process.env; transpile and evaluate it.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ts = require('typescript') as typeof import('typescript');
      const js = ts.transpileModule(await read('cors-eval', 'moro.config.ts'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText;
      const corsFor = (env: Record<string, string>) => {
        const mod: { exports: any } = { exports: {} };
        new Function('module', 'exports', 'process', 'console', js)(
          mod,
          mod.exports,
          { env },
          { warn: () => undefined }
        );
        return mod.exports.default.security.cors;
      };

      expect(corsFor({ NODE_ENV: 'development' })).toMatchObject({ enabled: true, origin: '*' });

      // Production without CORS_ORIGIN: the middleware is off, nothing is allowed.
      expect(corsFor({ NODE_ENV: 'production' }).enabled).toBe(false);

      const listed = corsFor({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://app.example.com, https://admin.example.com',
      });
      expect(listed.enabled).toBe(true);
      // Each listed origin is answered with itself (the header takes one origin).
      expect(listed.origin('https://app.example.com')).toBe('https://app.example.com');
      expect(listed.origin('https://admin.example.com')).toBe('https://admin.example.com');
      // Anything else never gets its own origin or a wildcard back.
      expect(listed.origin('https://evil.example')).toBe('https://app.example.com');
      expect(listed.origin(undefined)).toBe('https://app.example.com');
    });

    test('the Socket.IO adapter has no wildcard origin in production', async () => {
      await new ProjectInitializer().initializeProject('cors-sio', {
        features: 'websocket',
        websocket: 'socket.io',
        skipGit: true,
        skipInstall: true,
      });

      const index = await read('cors-sio', 'src', 'index.ts');
      expect(index).not.toContain(`cors: { origin: '*' }`);
      expect(index).toContain(`process.env.NODE_ENV === 'production'`);
      expect(index).toContain('process.env.CORS_ORIGIN');
      expect(await read('cors-sio', '.env')).toMatch(/^CORS_ORIGIN=$/m);
    });
  });

  describe('websocket setup', () => {
    test('registers the sample handlers through app.websocket()', async () => {
      await scaffold('ws-app', 'websocket');

      const setup = await read('ws-app', 'src', 'websockets', 'index.ts');
      expect(setup).toContain(`app.websocket('/', sampleWebSocketHandlers);`);
      // The app object has no getWebSocketAdapter(); calling it threw on every start.
      expect(setup).not.toContain('app.getWebSocketAdapter');
    });

    test.each(['socket.io', 'auto-detect'] as const)(
      '%s: message compression is written switched off, with what switching it on does',
      async websocket => {
        await new ProjectInitializer().initializeProject('ws-compression', {
          features: 'websocket',
          websocket,
          skipGit: true,
          skipInstall: true,
        });

        const index = await read('ws-compression', 'src', 'index.ts');
        expect(index).toMatch(
          /\/\/ true compresses messages for clients that support it[^\n]*\n\s+compression: false/
        );
        expect(index).not.toContain('compression: true');
      }
    );

    test('registers nothing when no adapter was selected', async () => {
      await new ProjectInitializer().initializeProject('ws-none', {
        features: 'websocket',
        websocket: 'none',
        skipGit: true,
        skipInstall: true,
      });

      const setup = await read('ws-none', 'src', 'websockets', 'index.ts');
      expect(setup).not.toMatch(/^\s*app\.websocket\(/m);
      expect(setup).not.toContain('app.getWebSocketAdapter');
    });
  });

  describe('--dry-run file list', () => {
    async function listFiles(dir: string, prefix = ''): Promise<string[]> {
      const out: string[] = [];
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), rel)));
        else out.push(rel);
      }
      return out;
    }

    // What --dry-run printed under "Files that would be created:".
    function previewedFiles(logSpy: jest.SpyInstance, project: string): string[] {
      const output = logSpy.mock.calls.map(call => String(call[0])).join('\n');
      return [...output.matchAll(new RegExp(`${project}/([\\w./-]+)`, 'g'))]
        .map(match => match[1])
        .filter((file, index, all) => all.indexOf(file) === index);
    }

    const cases: Array<[string, Record<string, string>]> = [
      ['defaults', { features: 'cors' }],
      ['database', { database: 'postgresql', features: 'auth,websocket' }],
      ['sqlite', { database: 'sqlite' }],
      ['testing with multiple validators', { features: 'testing', validation: 'multiple' }],
      ['serverless runtime', { runtime: 'aws-lambda', database: 'mongodb', features: 'auth' }],
    ];

    test.each(cases)('lists exactly the files init writes (%s)', async (_label, options) => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await new ProjectInitializer().initializeProject('preview-app', {
        ...options,
        dryRun: true,
      } as any);
      const previewed = previewedFiles(logSpy, 'preview-app').sort();
      expect(await exists('preview-app')).toBe(false);

      await new ProjectInitializer().initializeProject('preview-app', {
        ...options,
        skipGit: true,
        skipInstall: true,
      } as any);
      const written = (await listFiles(join(workDir, 'preview-app'))).sort();

      expect(previewed).toEqual(written);
    });
  });

  describe('dependency versions', () => {
    type Version = [number, number, number];

    const parse = (text: string): Version => {
      const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
      if (!match) throw new Error(`no version in "${text}"`);
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    };
    const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

    // Whether `version` is inside a range written with >= and ^ comparators
    // joined by ||, the forms the framework's peerDependencies use.
    function satisfies(version: Version, range: string): boolean {
      return range.split('||').some(part => {
        const comparator = part.trim();
        const floor = parse(comparator);
        if (comparator.startsWith('^')) {
          return version[0] === floor[0] && compare(version, floor) >= 0;
        }
        if (comparator.startsWith('>=')) return compare(version, floor) >= 0;
        throw new Error(`unsupported comparator "${comparator}"`);
      });
    }

    const combinations: Array<Record<string, string>> = [
      { validation: 'zod', database: 'postgresql', features: 'auth,docs', websocket: 'none' },
      { validation: 'joi', database: 'mysql', features: 'websocket', websocket: 'ws' },
      { validation: 'yup', database: 'sqlite', features: 'websocket', websocket: 'socket.io' },
      { validation: 'class-validator', database: 'mongodb', features: 'cors' },
      { validation: 'multiple', database: 'redis', features: 'websocket,auth' },
      { validation: 'zod', database: 'drizzle', features: 'testing' },
    ];

    async function generatedDependencies(
      name: string,
      options: Record<string, string>
    ): Promise<Record<string, string>> {
      await new ProjectInitializer().initializeProject(name, {
        ...options,
        skipGit: true,
        skipInstall: true,
      } as any);
      const pkg = JSON.parse(await read(name, 'package.json'));
      return { ...pkg.dependencies, ...pkg.devDependencies };
    }

    test('every generated range starts inside the range the framework accepts', async () => {
      const framework = JSON.parse(
        await fs.readFile(
          join(__dirname, '..', '..', 'node_modules', '@morojs', 'moro', 'package.json'),
          'utf8'
        )
      );
      const peers: Record<string, string> = framework.peerDependencies;
      const checked = new Set<string>();

      for (const [index, options] of combinations.entries()) {
        const dependencies = await generatedDependencies(`versions-${index}`, options);
        for (const [name, range] of Object.entries(dependencies)) {
          if (!peers[name]) continue;
          checked.add(name);
          expect({ name, range, ok: satisfies(parse(range), peers[name]) }).toEqual({
            name,
            range,
            ok: true,
          });
        }
      }

      // Which packages the framework lists depends on its version; these are
      // in every one.
      expect([...checked]).toEqual(
        expect.arrayContaining(['better-auth', 'drizzle-orm', 'joi', 'mysql2', 'pg', 'ws'])
      );
    });

    test.each([
      // First releases without a published advisory against them.
      ['zod', '4.6.6', { validation: 'zod' }],
      ['joi', '18.3.1', { validation: 'joi' }],
      ['ws', '8.21.0', { features: 'websocket', websocket: 'ws' }],
      ['better-auth', '1.7.7', { features: 'auth' }],
      ['mysql2', '3.23.1', { database: 'mysql' }],
      ['drizzle-orm', '0.45.2', { database: 'drizzle' }],
    ] as Array<[string, string, Record<string, string>]>)(
      '%s is generated at %s or newer',
      async (name, minimum, options) => {
        const dependencies = await generatedDependencies('minimum-app', options);

        expect(dependencies[name]).toBeDefined();
        expect(compare(parse(dependencies[name]), parse(minimum))).toBeGreaterThanOrEqual(0);
      }
    );
  });

  describe('drizzle packages', () => {
    test('the ORM is a runtime dependency and drizzle-kit a development one', async () => {
      await new ProjectInitializer().initializeProject('drizzle-app', {
        database: 'drizzle',
        skipGit: true,
        skipInstall: true,
      });

      const pkg = JSON.parse(await read('drizzle-app', 'package.json'));
      expect(pkg.dependencies['drizzle-orm']).toBeDefined();
      expect(pkg.dependencies['drizzle-kit']).toBeUndefined();
      expect(pkg.devDependencies['drizzle-kit']).toBeDefined();
    });
  });

  describe('start script', () => {
    test('node scaffolds start the compiled entry through tsx, a runtime dependency', async () => {
      await scaffold('start-node', 'cors');

      const pkg = JSON.parse(await read('start-node', 'package.json'));
      // moro.config.ts and the src/routes files are imported at start-up, which
      // plain Node before 22.18 cannot do.
      expect(pkg.scripts.start).toBe('tsx dist/src/index.js');
      expect(pkg.dependencies.tsx).toBeDefined();
      expect(pkg.devDependencies.tsx).toBeUndefined();
      // The dev script is unchanged.
      expect(pkg.scripts.dev).toBe('tsx watch src/index.ts');
    });
  });

  describe('testing feature', () => {
    async function scaffoldTesting(name: string, runtime?: string): Promise<void> {
      await new ProjectInitializer().initializeProject(name, {
        features: 'testing',
        ...(runtime && { runtime }),
        skipGit: true,
        skipInstall: true,
      } as any);
    }

    test('jest.config.js is an ES module, like the package it lives in', async () => {
      await scaffoldTesting('jest-esm');

      const pkg = JSON.parse(await read('jest-esm', 'package.json'));
      const jestConfig = await read('jest-esm', 'jest.config.js');
      expect(pkg.type).toBe('module');
      // module.exports is not defined in an ES module package.
      expect(jestConfig).not.toContain('module.exports');
      expect(jestConfig).toContain('export default {');
      expect(jestConfig).toContain(`preset: 'ts-jest/presets/default-esm'`);
      expect(jestConfig).toContain(`'^(\\\\.{1,2}/.*)\\\\.js$': '$1'`);
    });

    test('the test script runs Jest in ES module mode', async () => {
      await scaffoldTesting('jest-script');

      const pkg = JSON.parse(await read('jest-script', 'package.json'));
      expect(pkg.scripts.test).toBe('node --experimental-vm-modules node_modules/jest/bin/jest.js');
      expect(pkg.devDependencies.jest).toBeDefined();

      // Without the feature the script is the CLI's test command, as before.
      await scaffold('no-jest', 'cors');
      expect(JSON.parse(await read('no-jest', 'package.json')).scripts.test).toBe(
        'morojs-cli test'
      );
    });

    test('the node sample test picks a free port before the app starts and closes the app', async () => {
      await scaffoldTesting('jest-node');

      const sample = await read('jest-node', 'tests', 'app.test.ts');
      expect(sample).toContain(`from '@jest/globals'`);
      const portAt = sample.indexOf('process.env.PORT = String(port)');
      const importAt = sample.indexOf(`await import('../src/index.js')`);
      expect(portAt).toBeGreaterThan(-1);
      expect(importAt).toBeGreaterThan(portAt);
      expect(sample).toContain('await app?.close();');
      // The native engine has no Node http.Server to hand to supertest.
      expect(sample).not.toContain('getHttpServer');
    });

    test.each([
      ['aws-lambda', 'handler(', 'httpMethod'],
      ['vercel-edge', 'handler(new Request(', 'response.json()'],
      ['cloudflare-workers', 'handler(new Request(', 'response.json()'],
    ])('the %s sample test calls the exported handler', async (runtime, call, detail) => {
      await scaffoldTesting(`jest-${runtime}`, runtime);

      const sample = await read(`jest-${runtime}`, 'tests', 'app.test.ts');
      expect(sample).toContain(
        `({ default: handler } = (await import('../src/index.js')) as any);`
      );
      expect(sample).toContain(call);
      expect(sample).toContain(detail);
      expect(sample).not.toContain('supertest');
      expect(sample).not.toContain('getHttpServer');
    });
  });

  describe('database connection checks', () => {
    const setupFor = async (name: string, database: 'postgresql' | 'mysql' | 'mongodb') => {
      await new ProjectInitializer().initializeProject(name, {
        database,
        skipGit: true,
        skipInstall: true,
      });
      return read(name, 'src', 'database', 'index.ts');
    };

    test('postgresql releases the client it checks the connection with', async () => {
      const setup = await setupFor('check-pg', 'postgresql');

      expect(setup).toContain('const client = await pool.connect();');
      expect(setup).toContain('client.release();');
    });

    test('mysql opens a connection before it reports success', async () => {
      const setup = await setupFor('check-mysql', 'mysql');

      const connectAt = setup.indexOf('await pool.getConnection()');
      const successAt = setup.indexOf('Database connected successfully');
      expect(connectAt).toBeGreaterThan(-1);
      expect(successAt).toBeGreaterThan(connectAt);
      expect(setup).toContain('connection.release();');
    });

    test('mongodb does not wait the driver default of 30 seconds for a missing server', async () => {
      const setup = await setupFor('check-mongo', 'mongodb');

      expect(setup).toContain('serverSelectionTimeoutMS: 5000');
    });
  });
});
