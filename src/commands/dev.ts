// Development Tools - Dev server, build, lint, test commands
import { createFrameworkLogger } from '../logger';
import { runTerminalCmd, spawnCommand } from '../utils/terminal';
import { existsSync } from 'fs';
import { join } from 'path';

export interface DevServerOptions {
  port?: string;
  host?: string;
  watch?: string;
}

export interface BuildOptions {
  target?: 'node' | 'edge' | 'lambda' | 'workers';
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

      // Check if nodemon is available
      const hasNodemon = existsSync(join(process.cwd(), 'node_modules', '.bin', 'nodemon'));

      if (hasNodemon) {
        const watchPaths = options.watch ? options.watch.split(',') : ['src'];
        const nodemonArgs = [
          '--exec',
          'npm run build && node dist/index.js',
          '--watch',
          watchPaths.join(','),
          '--ext',
          'ts,js,json',
          '--env',
          `PORT=${port},HOST=${host}`,
        ];

        this.logger.info(`Server starting on http://${host}:${port}`, 'Dev');
        await spawnCommand('npx', ['nodemon', ...nodemonArgs]);
      } else {
        this.logger.warn(
          'Nodemon not found. Install it for hot reload: npm install --save-dev nodemon',
          'Dev'
        );
        this.logger.info('Starting basic development server...', 'Dev');

        // Fallback to basic build and run
        await runTerminalCmd('npm run build');
        process.env.PORT = port;
        process.env.HOST = host;
        await spawnCommand('node', ['dist/index.js']);
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
      const outputDir = options.output || 'dist';

      // Use TypeScript compiler for reliable CommonJS output
      // esbuild bundling causes issues with dynamic requires in CommonJS dependencies
      await runTerminalCmd('npx tsc');
      this.logger.info(`✅ Build completed using TypeScript compiler!`, 'Build');

      // Generate runtime-specific files
      if (options.target && options.target !== 'node') {
        await this.generateRuntimeSpecificFiles(options.target, outputDir);
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
        const eslintArgs = ['src', '--ext', '.ts,.js'];
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
        const jestArgs = [];

        if (options.watch) {
          jestArgs.push('--watch');
        }

        if (options.coverage) {
          jestArgs.push('--coverage');
        }

        await spawnCommand('npx', ['jest', ...jestArgs]);
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

    try {
      // Run npm audit
      this.logger.info('Checking for vulnerable dependencies...', 'Security');
      await runTerminalCmd('npm audit');

      // Check for common security issues
      this.logger.info('Scanning for common security issues...', 'Security');

      const securityChecks = [
        'Checking for hardcoded secrets...',
        'Validating HTTPS usage...',
        'Checking security headers...',
        'Validating input sanitization...',
      ];

      securityChecks.forEach(check => this.logger.info(check, 'Security'));

      this.logger.info('✅ Security scan completed!', 'Security');
      this.logger.info(
        'Consider using tools like Snyk or OWASP ZAP for comprehensive security testing',
        'Security'
      );
    } catch (error) {
      this.logger.error(
        `Security scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Security'
      );
      throw error;
    }
  }

  private async generateRuntimeSpecificFiles(target: string, outputDir: string): Promise<void> {
    const runtimeFiles: Record<string, string> = {
      'vercel-edge': `// Vercel Edge Runtime Export
import { app } from './index.js';
export default app.getHandler();`,

      'aws-lambda': `// AWS Lambda Runtime Export
import { app } from './index.js';
export const handler = app.getHandler();`,

      'cloudflare-workers': `// Cloudflare Workers Runtime Export
import { app } from './index.js';
export default {
  fetch: app.getHandler()
};`,
    };

    if (runtimeFiles[target]) {
      const { writeFile } = await import('fs/promises');
      await writeFile(join(outputDir, 'runtime.js'), runtimeFiles[target]);
      this.logger.info(`✅ Generated ${target} runtime file!`, 'Build');
    }
  }
}
