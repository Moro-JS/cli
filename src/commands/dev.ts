// Development Tools - Dev server, build, lint, test commands
import { createFrameworkLogger } from '../logger';
import { runTerminalCmd, spawnCommand } from '../utils/terminal';
import { startRestartLoop } from '../utils/restart-loop';
import { existsSync, readFileSync } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import { exec } from 'child_process';
import { isAbsolute, join, posix, relative, sep } from 'path';

// `--target` values accepted by `build`, mapped to the runtime each one produces
// an entry file for. The runtime names are accepted as well.
const BUILD_TARGET_RUNTIMES: Record<string, 'vercel-edge' | 'aws-lambda' | 'cloudflare-workers'> = {
  edge: 'vercel-edge',
  lambda: 'aws-lambda',
  workers: 'cloudflare-workers',
  'vercel-edge': 'vercel-edge',
  'aws-lambda': 'aws-lambda',
  'cloudflare-workers': 'cloudflare-workers',
};

// File types whose changes restart the `dev` server.
const WATCHED_EXTENSIONS = ['ts', 'js', 'json'];

/**
 * The compiled entry file of the project in `cwd`, relative to it.
 *
 * A project scaffolded by `init` compiles `src/index.ts` to `dist/src/index.js`
 * and records that in package.json "main"; other layouts emit `dist/index.js`.
 */
export function resolveBuiltEntry(cwd: string = process.cwd(), outputDir = 'dist'): string {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    const main = typeof pkg.main === 'string' ? pkg.main.replace(/^\.\//, '') : '';
    if (/\.[cm]?js$/.test(main) && main.startsWith(`${outputDir}/`)) return main;
  } catch {
    // No readable package.json: fall through to the conventional locations.
  }

  for (const candidate of [`${outputDir}/index.js`, `${outputDir}/src/index.js`]) {
    if (existsSync(join(cwd, candidate))) return candidate;
  }
  return `${outputDir}/index.js`;
}

/**
 * Environment for running Jest in the project in `cwd`.
 *
 * In an ES module package ("type": "module") Jest can only load the project's
 * sources and an ESM jest.config.js with Node's --experimental-vm-modules flag,
 * so it is added to NODE_OPTIONS there. Other projects get the environment
 * unchanged.
 */
export function jestEnvironment(cwd: string = process.cwd()): Record<string, string> {
  const env = { ...(process.env as Record<string, string>) };
  let isEsmPackage = false;
  try {
    isEsmPackage = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).type === 'module';
  } catch {
    // No readable package.json: leave the environment alone.
  }

  const flag = '--experimental-vm-modules';
  if (isEsmPackage && !(env.NODE_OPTIONS || '').includes(flag)) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, flag].filter(Boolean).join(' ');
  }
  return env;
}

/**
 * True when the project's ESLint rejects `--ext`.
 *
 * The flag belongs to the legacy (eslintrc) configuration. In flat-config mode
 * ESLint 8.57 and 9.0 - 9.20 exit with "Invalid option '--ext'"; 9.21 accepts
 * it again. Everywhere it is accepted it keeps being passed, so the set of
 * linted files does not change for projects where the command already works.
 */
export function eslintRejectsExtFlag(cwd: string = process.cwd()): boolean {
  let major: number;
  let minor: number;
  try {
    const pkg = JSON.parse(
      readFileSync(join(cwd, 'node_modules', 'eslint', 'package.json'), 'utf8')
    );
    [major, minor] = String(pkg.version)
      .split('.')
      .map(part => parseInt(part, 10));
  } catch {
    return false;
  }
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;

  const flatConfigFile = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
    'eslint.config.mts',
    'eslint.config.cts',
  ].some(file => existsSync(join(cwd, file)));

  // ESLint 9 uses flat config unless it is switched off explicitly.
  if (major === 9) return minor < 21 && process.env.ESLINT_USE_FLAT_CONFIG !== 'false';
  // ESLint 8.57 switches to flat config when it finds a flat config file.
  if (major === 8) return minor >= 57 && flatConfigFile;
  return false;
}

/**
 * How `dev` runs the compiled entry of the project in `cwd`.
 *
 * At start-up the framework imports the project's moro.config.ts and its
 * TypeScript route and module files. Node.js loads TypeScript itself from 22.18
 * on. An older Node.js cannot, and the app then starts without its
 * configuration and routes, so there the entry is run through the project's own
 * tsx when it has one. Where Node.js loads TypeScript, plain `node` is kept.
 *
 * `notice` is set for a TypeScript project that has neither.
 */
export function devEntryRunner(cwd: string = process.cwd()): {
  runner: 'node' | 'tsx';
  notice?: string;
} {
  // 'strip' or 'transform' where this Node.js loads .ts files, false or absent where it does not.
  if ((process.features as { typescript?: unknown }).typescript) return { runner: 'node' };

  if (existsSync(join(cwd, 'node_modules', '.bin', 'tsx'))) return { runner: 'tsx' };

  const isTypeScriptProject = ['moro.config.ts', 'tsconfig.json'].some(file =>
    existsSync(join(cwd, file))
  );
  if (!isTypeScriptProject) return { runner: 'node' };
  return {
    runner: 'node',
    notice:
      `Node.js ${process.version} cannot load TypeScript files, so the app starts without ` +
      'moro.config.ts and its TypeScript routes. Use Node.js 22.18 or newer, or add tsx to ' +
      'the project: npm install tsx',
  };
}

export interface DevServerOptions {
  port?: string;
  host?: string;
  watch?: string;
}

export interface BuildOptions {
  target?: 'node' | 'edge' | 'lambda' | 'workers';
  /** Output directory. When set, it is passed to the compiler as --outDir. */
  output?: string;
  minify?: boolean;
}

export interface LintOptions {
  fix?: boolean;
}

export interface TestOptions {
  watch?: boolean;
  coverage?: boolean;
}

export class DevTools {
  private logger = createFrameworkLogger('DevTools');

  async startDevServer(options: DevServerOptions): Promise<void> {
    this.logger.info('Starting development server with hot reload...', 'Dev');

    try {
      const port = options.port || '3000';
      const host = options.host || 'localhost';

      const entry = resolveBuiltEntry();
      const { runner, notice } = devEntryRunner();
      if (notice) this.logger.warn(notice, 'Dev');
      const command = `npm run build && ${runner} ${entry}`;
      const watchPaths = options.watch
        ? options.watch
            .split(',')
            .map(path => path.trim())
            .filter(Boolean)
        : ['src'];

      // --port and --host travel in the environment of the process that runs
      // the app. Only values given on the command line are set: the defaults
      // must not override the PORT / HOST of the project's own .env.
      const env: Record<string, string> = { ...(process.env as Record<string, string>) };
      if (options.port) env.PORT = options.port;
      if (options.host) env.HOST = options.host;

      this.logger.info(
        `Server starting on http://${options.host || env.HOST || host}:${options.port || env.PORT || port}`,
        'Dev'
      );

      // A project that has nodemon installed keeps running under it, with its
      // own nodemon configuration. Every other project is restarted by the CLI.
      const hasNodemon = existsSync(join(process.cwd(), 'node_modules', '.bin', 'nodemon'));

      if (hasNodemon) {
        const nodemonArgs = [
          '--exec',
          command,
          // nodemon takes one --watch per path
          ...watchPaths.flatMap(path => ['--watch', path]),
          '--ext',
          WATCHED_EXTENSIONS.join(','),
        ];
        await spawnCommand('npx', ['nodemon', ...nodemonArgs], { env });
      } else {
        this.logger.info('to restart at any time, enter `rs`', 'Dev');
        this.logger.info(`watching path(s): ${watchPaths.join(' ')}`, 'Dev');
        this.logger.info(`watching extensions: ${WATCHED_EXTENSIONS.join(',')}`, 'Dev');

        const loop = startRestartLoop({
          command,
          watch: watchPaths,
          extensions: WATCHED_EXTENSIONS,
          env,
          logger: {
            info: message => this.logger.info(message, 'Dev'),
            error: message => this.logger.error(message, 'Dev'),
          },
          handleSignals: true,
          stdin: process.stdin,
        });
        // Ctrl+C ends the loop; the command then exits with the usual code for
        // the signal instead of reporting a failure.
        process.exitCode = await loop.done;
      }
    } catch (error) {
      this.logger.error(
        `Dev server failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Dev'
      );
      throw error;
    }
  }

  async buildProject(options: BuildOptions): Promise<void> {
    this.logger.info(`Building project for ${options.target || 'node'} runtime...`, 'Build');

    try {
      // Use TypeScript compiler for reliable CommonJS output
      // esbuild bundling causes issues with dynamic requires in CommonJS dependencies
      await runTerminalCmd(
        options.output ? `npx tsc --outDir ${JSON.stringify(options.output)}` : 'npx tsc'
      );
      this.logger.info(`✅ Build completed using TypeScript compiler!`, 'Build');

      // Where the compiler wrote its output: --output when given, otherwise the
      // project's own tsconfig outDir.
      const outputDir = options.output || (await this.resolveCompilerOutDir()) || 'dist';

      // Generate runtime-specific files
      if (options.target && options.target !== 'node') {
        await this.generateRuntimeSpecificFiles(options.target, outputDir);
      }

      if (options.minify) {
        const count = await this.minifyOutput(outputDir);
        this.logger.info(`✅ Minified ${count} JavaScript file(s) in ${outputDir}`, 'Build');
      }
    } catch (error) {
      this.logger.error(
        `Build failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Build'
      );
      throw error;
    }
  }

  async lintProject(options: LintOptions): Promise<void> {
    this.logger.info('Linting project...', 'Lint');

    try {
      const hasEslint = existsSync(join(process.cwd(), 'node_modules', '.bin', 'eslint'));

      if (hasEslint) {
        // --ext is left out only where ESLint rejects it (flat config before 9.21);
        // there the file types come from the config file.
        const eslintArgs = eslintRejectsExtFlag() ? ['src'] : ['src', '--ext', '.ts,.js'];
        if (options.fix) {
          eslintArgs.push('--fix');
        }

        await spawnCommand('npx', ['eslint', ...eslintArgs]);
        this.logger.info('✅ Linting completed!', 'Lint');

        // Also run prettier if available
        const hasPrettier = existsSync(join(process.cwd(), 'node_modules', '.bin', 'prettier'));
        if (hasPrettier) {
          await spawnCommand('npx', ['prettier', '--write', 'src/**/*.ts']);
          this.logger.info('✅ Code formatted with Prettier!', 'Lint');
        }
      } else {
        this.logger.warn(
          'ESLint not found. Install it: npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin',
          'Lint'
        );
      }
    } catch (error) {
      this.logger.error(
        `Linting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Lint'
      );
      throw error;
    }
  }

  async runTests(options: TestOptions): Promise<void> {
    this.logger.info('Running tests...', 'Test');

    try {
      const hasJest = existsSync(join(process.cwd(), 'node_modules', '.bin', 'jest'));

      if (hasJest) {
        const jestArgs: string[] = [];

        if (options.watch) {
          jestArgs.push('--watch');
        }

        if (options.coverage) {
          jestArgs.push('--coverage');
        }

        await spawnCommand('npx', ['jest', ...jestArgs], { env: jestEnvironment() });
        this.logger.info('✅ Tests completed!', 'Test');
      } else {
        this.logger.warn(
          'Jest not found. Install it: npm install --save-dev jest @types/jest ts-jest',
          'Test'
        );
      }
    } catch (error) {
      this.logger.error(
        `Tests failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Test'
      );
      throw error;
    }
  }

  async securityScan(): Promise<void> {
    this.logger.info('Running security scan...', 'Security');
    this.logger.info('Checking for vulnerable dependencies with npm audit...', 'Security');

    const audit = await this.runNpmAudit();

    // Always show what npm audit printed: it is the result of this command.
    const report = [audit.stdout.trim(), audit.stderr.trim()].filter(Boolean).join('\n');
    if (report) console.log(report);

    if (audit.exitCode !== 0) {
      // npm audit exits non-zero both when it finds vulnerabilities and when it
      // cannot run (for example without a lockfile). Say which one happened.
      if (/\d+\s+vulnerabilit/i.test(audit.stdout)) {
        throw new Error(
          'npm audit found vulnerable dependencies (report above). ' +
            'Run "npm audit fix" to apply the available fixes.'
        );
      }
      throw new Error(
        `npm audit could not complete (exit code ${audit.exitCode}); its output is shown above.`
      );
    }

    this.logger.info('✅ npm audit found no known vulnerabilities', 'Security');
    this.logger.info(
      'This command checks dependencies only. It does not inspect source code for ' +
        'hardcoded secrets, HTTPS usage, security headers or input handling.',
      'Security'
    );
    this.logger.info(
      'Consider using tools like Snyk or OWASP ZAP for comprehensive security testing',
      'Security'
    );
  }

  /** Runs `npm audit` in the current project and captures its output and exit code. */
  private runNpmAudit(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise(resolve => {
      exec(
        'npm audit',
        { cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
          resolve({ exitCode, stdout: String(stdout), stderr: String(stderr) });
        }
      );
    });
  }

  /** The outDir of the project's tsconfig, relative to the project, if it can be read. */
  private async resolveCompilerOutDir(): Promise<string | undefined> {
    try {
      const { stdout } = await runTerminalCmd('npx tsc --showConfig');
      const outDir = JSON.parse(stdout)?.compilerOptions?.outDir;
      if (typeof outDir !== 'string' || !outDir) return undefined;
      const rel = isAbsolute(outDir) ? relative(process.cwd(), outDir) : outDir;
      return rel.split(sep).join('/').replace(/^\.\//, '').replace(/\/$/, '') || undefined;
    } catch {
      return undefined;
    }
  }

  /** Minifies every emitted .js file under `outputDir` in place. Returns the file count. */
  private async minifyOutput(outputDir: string): Promise<number> {
    const { transform } = await import('esbuild');
    let count = 0;

    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') await walk(file);
          continue;
        }
        if (!entry.isFile() || !/\.[cm]?js$/.test(entry.name)) continue;

        const source = await readFile(file, 'utf8');
        // keepNames: class and function names stay readable in stack traces and
        // for libraries that read them. The emitted source map no longer matches
        // the minified file, so its reference is not carried over.
        const result = await transform(source, { minify: true, keepNames: true, sourcefile: file });
        await writeFile(file, result.code);
        count++;
      }
    };

    await walk(join(process.cwd(), outputDir));
    return count;
  }

  private async generateRuntimeSpecificFiles(target: string, outputDir: string): Promise<void> {
    const runtime = BUILD_TARGET_RUNTIMES[target];
    if (!runtime) {
      this.logger.warn(
        `Unknown build target "${target}": no runtime file generated. ` +
          `Use one of: node, ${Object.keys(BUILD_TARGET_RUNTIMES).slice(0, 3).join(', ')}.`,
        'Build'
      );
      return;
    }

    // runtime.js sits at the top of the output directory and re-exports the
    // app from the compiled entry (dist/src/index.js in a scaffolded project).
    const entry = resolveBuiltEntry(process.cwd(), outputDir);
    const entryImport = './' + posix.relative(outputDir, entry);

    const runtimeFiles: Record<string, string> = {
      'vercel-edge': `// Vercel Edge Runtime Export
import { app } from '${entryImport}';
export default app.getHandler();`,

      'aws-lambda': `// AWS Lambda Runtime Export
import { app } from '${entryImport}';
export const handler = app.getHandler();`,

      'cloudflare-workers': `// Cloudflare Workers Runtime Export
import { app } from '${entryImport}';
export default {
  fetch: app.getHandler()
};`,
    };

    await writeFile(join(process.cwd(), outputDir, 'runtime.js'), runtimeFiles[runtime]);
    this.logger.info(`✅ Generated ${runtime} runtime file: ${outputDir}/runtime.js`, 'Build');
  }
}
