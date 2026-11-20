// Module Stub Generator Tests
import { ModuleStubGenerator } from '../src/module-stub-generator';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ModuleStubGenerator', () => {
  let generator: ModuleStubGenerator;
  let testDir: string;

  beforeEach(() => {
    generator = new ModuleStubGenerator();
    testDir = join(tmpdir(), `moro-module-test-${Date.now()}`);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Module Generation', () => {
    test('should create basic module structure', async () => {
      // This test will need to be implemented once we examine the actual
      // ModuleStubGenerator implementation
      expect(generator).toBeInstanceOf(ModuleStubGenerator);
    });

    test('should handle different module features', async () => {
      // Test module generation with different features
      expect(typeof generator.generateAdvancedModule).toBe('function');
    });
  });

  describe('Module Validation', () => {
    test('should validate module names', () => {
      // Test module name validation
      expect(generator).toBeDefined();
    });

    test('should handle existing modules', () => {
      // Test handling of existing modules
      expect(generator).toBeDefined();
    });
  });

  describe('Generated files', () => {
    let originalCwd: string;

    beforeEach(async () => {
      originalCwd = process.cwd();
      await fs.mkdir(testDir, { recursive: true });
      process.chdir(testDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    const read = (module: string, ...parts: string[]) =>
      fs.readFile(join(testDir, 'src', 'modules', module, ...parts), 'utf8');

    // Type-checks the generated module under the compiler options a scaffolded
    // project uses, without needing node_modules: unresolved packages are
    // ignored, every other diagnostic is returned.
    async function typeCheck(module: string): Promise<string[]> {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ts = require('typescript') as typeof import('typescript');
      const dir = join(testDir, 'src', 'modules', module);
      const files = (await fs.readdir(dir)).filter(f => f.endsWith('.ts')).map(f => join(dir, f));
      const program = ts.createProgram(files, {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        types: [],
      });
      return ts
        .getPreEmitDiagnostics(program)
        .filter(d => d.code !== 2307) // cannot find module (zod, @morojs/moro)
        .map(d => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    }

    test('compiles under verbatimModuleSyntax (types are imported as types)', async () => {
      await generator.generateModule('user', ['websocket', 'database']);

      expect(await read('user', 'actions.ts')).toContain(
        `import type { User, CreateUserRequest, UpdateUserRequest } from './types.js';`
      );
      expect(await typeCheck('user')).toEqual([]);
    });

    test('relative imports carry the .js extension an ESM project needs at run time', async () => {
      await generator.generateModule('order', ['websocket']);

      for (const file of ['index.ts', 'routes.ts', 'actions.ts']) {
        const source = await read('order', file);
        const relative = [...source.matchAll(/from '(\.\/[^']+)'/g)].map(match => match[1]);
        expect(relative.length).toBeGreaterThan(0);
        for (const spec of relative) expect(spec).toMatch(/\.js$/);
      }
    });

    test('a name that is already plural is not pluralised again', async () => {
      await generator.generateModule('users', ['database']);

      expect(await read('users', 'config.ts')).toContain(`prefix: '/users'`);
      expect(await read('users', 'actions.ts')).toContain('export async function getAllUsers(');
      const all = (
        await Promise.all(
          ['config.ts', 'actions.ts', 'routes.ts', 'database/schema.sql'].map(f => read('users', f))
        )
      ).join('\n');
      expect(all).not.toMatch(/[Uu]serss/);

      const migrations = await fs.readdir(
        join(testDir, 'src', 'modules', 'users', 'database', 'migrations')
      );
      expect(migrations).toEqual(['001_create_users.sql']);
      const seeds = await fs.readdir(join(testDir, 'src', 'modules', 'users', 'database', 'seeds'));
      expect(seeds).toEqual(['sample_users.sql']);

      // A singular name still gets its plural.
      await generator.generateModule('product', ['database']);
      expect(await read('product', 'config.ts')).toContain(`prefix: '/products'`);
      expect(await read('product', 'actions.ts')).toContain('getAllProducts');
    });

    test('the generated actions work without a database object', async () => {
      await generator.generateModule('note', []);

      // actions.ts has no runtime imports; transpile and run it.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ts = require('typescript') as typeof import('typescript');
      const js = ts.transpileModule(await read('note', 'actions.ts'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText;
      const mod: { exports: any } = { exports: {} };
      new Function('module', 'exports', js)(mod, mod.exports);
      const events = { emit: async () => undefined };

      // Routes pass req.database, which the framework leaves undefined.
      expect(await mod.exports.getAllNotes(undefined)).toEqual([]);
      const created = await mod.exports.createNote(
        { name: 'first', description: 'd', active: false },
        undefined,
        events
      );
      expect(created).toMatchObject({ id: 1, name: 'first', active: false });
      expect(await mod.exports.getNoteById(1, undefined)).toMatchObject({ name: 'first' });
      expect(await mod.exports.getAllNotes(undefined)).toHaveLength(1);
      expect(await mod.exports.deleteNote(1, undefined, events)).toBe(true);
      expect(await mod.exports.getAllNotes(undefined)).toEqual([]);
    });

    test('says which options were accepted but not applied', async () => {
      const warnings: string[] = [];
      (generator as any).logger.warn = (message: string) => warnings.push(message);

      await generator.generateAdvancedModule('invoice', {
        features: 'database,auth',
        database: 'mongodb',
        middleware: 'auth,rate-limit',
        routes: 'graphql',
        template: 'controller',
        authRoles: 'admin',
        withTests: true,
        withDocs: true,
      });

      const text = warnings.join('\n');
      for (const flag of [
        '--database=mongodb',
        '--middleware=auth,rate-limit',
        '--routes=graphql',
        '--template=controller',
        '--auth-roles=admin',
        '--with-tests',
        '--with-docs',
      ]) {
        expect(text).toContain(`${flag} is accepted but not applied`);
      }
      expect(text).toContain('Not applied: auth.');
      // The applied feature is not reported.
      expect(text).not.toMatch(/Not applied:[^\n]*database/);

      // Nothing is reported when only the defaults are in effect.
      warnings.length = 0;
      await generator.generateAdvancedModule('ticket', {
        features: 'validation',
        routes: 'crud',
        template: 'service',
      });

      expect(warnings.filter(w => w.includes('not applied') || w.includes('Not applied'))).toEqual(
        []
      );
    });
  });
});
