// db setup / migrate / seed – generated files and what the commands report.
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseManager } from '../../src/commands/database';

describe('DatabaseManager', () => {
  let workDir: string;
  let originalCwd: string;
  let manager: DatabaseManager;
  let logged: Array<{ level: string; message: string }>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workDir = await fs.mkdtemp(join(tmpdir(), 'moro-db-'));
    process.chdir(workDir);

    manager = new DatabaseManager();
    logged = [];
    const record = (level: string) => (message: string) => logged.push({ level, message });
    (manager as any).logger = {
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
      debug: record('debug'),
    };
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(workDir, { recursive: true, force: true });
  });

  const read = (...parts: string[]) => fs.readFile(join(workDir, ...parts), 'utf8');
  const output = () => logged.map(entry => entry.message).join('\n');

  // Transpiles a generated runner and returns its exports. The runners import
  // fs, path and the framework logger only.
  async function loadRunner(file: string): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ts = require('typescript') as typeof import('typescript');
    const js = ts.transpileModule(await read('src', 'database', file), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod: { exports: any } = { exports: {} };
    const fakeRequire = (name: string) =>
      name === '@morojs/moro'
        ? { createFrameworkLogger: () => ({ info: () => undefined }) }
        : // eslint-disable-next-line @typescript-eslint/no-var-requires
          require(name);
    new Function('module', 'exports', 'require', js)(mod, mod.exports, fakeRequire);
    return mod.exports;
  }

  describe('db migrate / db seed', () => {
    test('migrate reports that nothing was run instead of claiming success', async () => {
      await fs.mkdir(join(workDir, 'src', 'database', 'migrations'), { recursive: true });
      await fs.writeFile(join(workDir, 'src', 'database', 'migrations', '001_init.sql'), '-- UP\n');

      await expect(manager.runMigrations({ up: true })).resolves.toBeUndefined();

      expect(output()).toContain('No migration was run');
      expect(output()).toContain('001_init.sql');
      expect(output()).not.toMatch(/completed successfully/i);
    });

    test('seed reports that nothing was run instead of claiming success', async () => {
      await fs.mkdir(join(workDir, 'src', 'database', 'seeds'), { recursive: true });
      await fs.writeFile(join(workDir, 'src', 'database', 'seeds', 'development.sql'), '');

      await expect(manager.runSeeds({ environment: 'development' })).resolves.toBeUndefined();

      expect(output()).toContain('No seed was run');
      expect(output()).toContain('development.sql');
      expect(output()).not.toMatch(/seeded successfully/i);
    });

    test('points at the generated runner when the project has one', async () => {
      await manager.setupAdapter('postgresql', { withMigrations: true, withSeeds: true });
      logged.length = 0;

      await manager.runMigrations({ down: true });
      await manager.runSeeds({});

      expect(output()).toContain('src/database/migration-runner.ts');
      expect(output()).toContain('runDown()');
      expect(output()).toContain('src/database/seed-runner.ts');
    });
  });

  describe('db setup', () => {
    test('--port reaches the generated code and the env template', async () => {
      await manager.setupAdapter('postgresql', { port: '6543' });

      expect(await read('src', 'database', 'index.ts')).toContain(
        `parseInt(process.env.POSTGRES_PORT || '6543')`
      );
      expect(await read('.env.example')).toMatch(/^POSTGRES_PORT=6543$/m);

      // Without --port, and for a value that is not a port, the default stays.
      await manager.setupAdapter('mysql', {});
      expect(await read('.env.example')).toMatch(/^MYSQL_PORT=3306$/m);
      await manager.setupAdapter('redis', { port: 'not-a-port' });
      expect(await read('.env.example')).toMatch(/^REDIS_PORT=6379$/m);
    });

    test('mongodb puts --port into the connection string', async () => {
      await manager.setupAdapter('mongodb', { port: '27099', database: 'shop' });

      expect(await read('.env.example')).toContain('MONGODB_URI=mongodb://localhost:27099/shop');
    });

    test('adapter options use the names the framework adapters accept', async () => {
      await manager.setupAdapter('postgresql', {});
      const postgres = await read('src', 'database', 'index.ts');
      expect(postgres).toContain('user: process.env.POSTGRES_USER');
      expect(postgres).not.toMatch(/^\s*username:/m);
      expect(postgres).not.toContain('acquireTimeout');

      await manager.setupAdapter('drizzle', {});
      const drizzle = await read('src', 'database', 'index.ts');
      expect(drizzle).toContain('database: db');

      // The framework logger takes (message, context): no error object in between.
      expect(postgres).not.toMatch(/logger\.error\([^)]*, error, /);
      expect(drizzle).not.toMatch(/logger\.error\([^)]*, error, /);
    });

    test('mysql reads the user from the variable the framework configuration uses', async () => {
      await manager.setupAdapter('mysql', { username: 'shop' });

      expect(await read('src', 'database', 'index.ts')).toContain('process.env.MYSQL_USERNAME');
      expect(await read('.env.example')).toMatch(/^MYSQL_USERNAME=shop$/m);
    });

    test('the generated migration runner executes each migration in order', async () => {
      await manager.setupAdapter('postgresql', { withMigrations: true });
      const migrations = join(workDir, 'src', 'database', 'migrations');
      await fs.writeFile(
        join(migrations, '002_add_posts.sql'),
        '-- UP\nCREATE TABLE posts (id INT);\n-- DOWN\nDROP TABLE posts;'
      );

      const { MigrationRunner } = await loadRunner('migration-runner.ts');
      const queries: string[] = [];
      const runner = new MigrationRunner({ query: async (sql: string) => queries.push(sql) });

      await runner.runUp();
      expect(queries).toHaveLength(2);
      expect(queries[0]).toContain('CREATE TABLE IF NOT EXISTS users');
      expect(queries[1]).toBe('CREATE TABLE posts (id INT);');

      queries.length = 0;
      await runner.runDown();
      expect(queries).toEqual(['DROP TABLE posts;', 'DROP TABLE IF EXISTS users;']);
    });

    test('the generated seed runner executes the seed file for the environment', async () => {
      await manager.setupAdapter('postgresql', { withSeeds: true });

      const { SeedRunner } = await loadRunner('seed-runner.ts');
      const queries: string[] = [];
      await new SeedRunner({ query: async (sql: string) => queries.push(sql) }).run('development');

      expect(queries).toHaveLength(1);
      expect(queries[0]).toContain('Development Seed Data');
    });
  });
});
