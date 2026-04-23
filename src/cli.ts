#!/usr/bin/env node

// MoroJS CLI - Comprehensive Development Toolkit
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createFrameworkLogger } from './logger';
import { ModuleStubGenerator } from './module-stub-generator';
import { ProjectInitializer, ProjectInitOptions } from './commands/init';
import { ConfigManager, ConfigOptions } from './commands/config';
import { DatabaseManager } from './commands/database';
import { DeploymentManager } from './commands/deploy';
import {
  DevTools,
  DevServerOptions,
  BuildOptions as DevBuildOptions,
  LintOptions as DevLintOptions,
  TestOptions as DevTestOptions,
} from './commands/dev';
import { MiddlewareManager } from './commands/middleware';
import { withErrorHandling, assertMutuallyExclusive } from './utils/options';
import { checkForUpdates } from './utils/update-notifier';

const logger = createFrameworkLogger('MoroJS-CLI');

// Read version from package.json
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version: string = packageJson.version;

// ----- Typed option interfaces (one per command) -------------------------

interface GlobalOptions {
  verbose?: boolean;
  quiet?: boolean;
}

interface ModuleCreateOptions {
  features?: string;
  database?: string;
  middleware?: string;
  routes?: string;
  template?: string;
  authRoles?: string;
  withTests?: boolean;
  withDocs?: boolean;
}

type ConfigInitOptions = ConfigOptions;

interface ConfigEnvOptions {
  environment: string;
}

interface DbSetupOptions {
  host?: string;
  port?: string;
  username?: string;
  database?: string;
  withMigrations?: boolean;
  withSeeds?: boolean;
}

interface DbMigrateOptions {
  up?: boolean;
  down?: boolean;
  reset?: boolean;
}

interface DbSeedOptions {
  environment?: string;
}

interface MiddlewareAddOptions {
  config?: string;
}

interface DeployVercelOptions {
  domain?: string;
}

interface DeployLambdaOptions {
  region?: string;
  memory?: string;
  timeout?: string;
}

interface DeployWorkersOptions {
  name?: string;
}

type DevOptions = DevServerOptions;
type BuildOptions = DevBuildOptions;
type LintOptions = DevLintOptions;
type TestOptions = DevTestOptions;

// ------------------------------------------------------------------------

export async function runCLI(): Promise<void> {
  // Best-effort background check for newer CLI versions.
  checkForUpdates({ name: packageJson.name, version });

  const program = new Command();

  program
    .name('morojs-cli')
    .description('MoroJS Framework - Comprehensive Development Toolkit')
    .version(version)
    .option('--verbose', 'Enable verbose logging')
    .option('--quiet', 'Suppress all output except errors')
    .addHelpText(
      'after',
      `
Tip: You don't need to install this CLI. Run any command via npx:
  npx @morojs/cli <command> [options]

For full examples: https://morojs.com/cli`
    )
    .hook('preAction', (thisCommand: Command) => {
      const opts = thisCommand.opts<GlobalOptions>();
      assertMutuallyExclusive(opts as Record<string, unknown>, ['verbose', 'quiet']);
      if (opts.verbose) process.env.LOG_LEVEL = 'debug';
      if (opts.quiet) process.env.LOG_LEVEL = 'error';
    });

  // -- Project Initialization --------------------------------------------
  program
    .command('init <project-name>')
    .description('Initialize a new MoroJS project')
    .option(
      '-r, --runtime <type>',
      'Runtime adapter (node|vercel-edge|aws-lambda|cloudflare-workers) [default: node]'
    )
    .option(
      '-d, --database <type>',
      'Database adapter (mysql|postgresql|sqlite|mongodb|redis|drizzle|none)'
    )
    .option(
      '-f, --features <features>',
      'Comma-separated features (auth,cors,helmet,compression,websocket,docs,rate-limit,cache,circuit-breaker,monitoring,testing)'
    )
    .option('-w, --websocket <adapter>', 'WebSocket adapter (auto-detect|socket.io|ws|none)')
    .option(
      '-v, --validation <library>',
      'Validation library (zod|joi|yup|class-validator|multiple)'
    )
    .option('-t, --template <template>', 'Project template (api|fullstack|microservice)')
    .option(
      '-p, --package-manager <pm>',
      'Package manager to use for install scripts (npm|yarn|pnpm) [auto-detected]'
    )
    .option('--fast', 'Skip all prompts and use sensible defaults (non-interactive)')
    .option('--force', 'Overwrite existing directory without prompting')
    .option('--dry-run', 'Print what would be created without writing any files')
    .option('--skip-git', 'Skip Git repository initialization')
    .option('--skip-install', 'Skip dependency installation')
    .action(
      withErrorHandling('Init', async (projectName: string, options: ProjectInitOptions) => {
        const initializer = new ProjectInitializer();
        await initializer.initializeProject(projectName, options);
      })
    );

  // -- Module Generation -------------------------------------------------
  const moduleCmd = program.command('module').alias('m').description('Module management commands');

  moduleCmd
    .command('create <name>')
    .alias('new')
    .description('Create a new module with advanced features')
    .option(
      '-f, --features <features>',
      'Features: websocket,database,auth,cache,validation,docs',
      'validation'
    )
    .option('-d, --database <type>', 'Database adapter type')
    .option(
      '-m, --middleware <middleware>',
      'Built-in middleware: auth,cors,rate-limit,cache,validation'
    )
    .option('-r, --routes <routes>', 'Route patterns: crud,rest,graphql', 'crud')
    .option(
      '-t, --template <template>',
      'Module template: service,controller,repository',
      'service'
    )
    .option('--auth-roles <roles>', 'Authentication roles for protected routes')
    .option('--with-tests', 'Generate test files')
    .option('--with-docs', 'Generate API documentation')
    .action(
      withErrorHandling('Module', async (name: string, options: ModuleCreateOptions) => {
        const generator = new ModuleStubGenerator();
        await generator.generateAdvancedModule(name, options);
      })
    );

  moduleCmd
    .command('list')
    .description('List all modules in the project')
    .action(
      withErrorHandling('Module', async () => {
        const generator = new ModuleStubGenerator();
        await generator.listModules();
      })
    );

  // -- Configuration Management ------------------------------------------
  const configCmd = program.command('config').alias('c').description('Configuration management');

  configCmd
    .command('init')
    .description('Generate moro.config.ts with intelligent defaults')
    .option(
      '-e, --environment <env>',
      'Target environment (development|staging|production)',
      'development'
    )
    .option('-d, --database <type>', 'Primary database type')
    .option('-r, --runtime <type>', 'Runtime adapter type')
    .action(
      withErrorHandling('Config', async (options: ConfigInitOptions) => {
        const configManager = new ConfigManager();
        await configManager.initializeConfig(options);
      })
    );

  configCmd
    .command('validate')
    .description('Validate existing configuration')
    .action(
      withErrorHandling('Config', async () => {
        const configManager = new ConfigManager();
        await configManager.validateConfig();
      })
    );

  configCmd
    .command('env')
    .description('Generate .env template with all available options')
    .option('-e, --environment <env>', 'Environment type', 'development')
    .action(
      withErrorHandling('Config', async (options: ConfigEnvOptions) => {
        const configManager = new ConfigManager();
        await configManager.generateEnvTemplate(options);
      })
    );

  // -- Database Management -----------------------------------------------
  const dbCmd = program.command('database').alias('db').description('Database management');

  dbCmd
    .command('setup <type>')
    .description('Setup database adapter with configuration')
    .option('-h, --host <host>', 'Database host')
    .option('-p, --port <port>', 'Database port')
    .option('-u, --username <username>', 'Database username')
    .option('-d, --database <database>', 'Database name')
    .option('--with-migrations', 'Generate migration system')
    .option('--with-seeds', 'Generate seed system')
    .action(
      withErrorHandling('Database', async (type: string, options: DbSetupOptions) => {
        const dbManager = new DatabaseManager();
        await dbManager.setupAdapter(type, options);
      })
    );

  dbCmd
    .command('migrate')
    .description('Run database migrations')
    .option('--up', 'Run migrations up')
    .option('--down', 'Run migrations down')
    .option('--reset', 'Reset all migrations')
    .action(
      withErrorHandling('Database', async (options: DbMigrateOptions) => {
        const dbManager = new DatabaseManager();
        await dbManager.runMigrations(options);
      })
    );

  dbCmd
    .command('seed')
    .description('Run database seeds')
    .option('-e, --environment <env>', 'Environment', 'development')
    .action(
      withErrorHandling('Database', async (options: DbSeedOptions) => {
        const dbManager = new DatabaseManager();
        await dbManager.runSeeds(options);
      })
    );

  // -- Middleware Management ---------------------------------------------
  const middlewareCmd = program
    .command('middleware')
    .alias('mw')
    .description('Middleware management');

  middlewareCmd
    .command('add <type>')
    .description('Add built-in middleware configuration')
    .option('-c, --config <config>', 'Middleware configuration (JSON string)')
    .action(
      withErrorHandling('Middleware', async (type: string, options: MiddlewareAddOptions) => {
        const middlewareManager = new MiddlewareManager();
        await middlewareManager.addMiddleware(type, options);
      })
    );

  middlewareCmd
    .command('list')
    .description('List available built-in middleware')
    .action(
      withErrorHandling('Middleware', async () => {
        const middlewareManager = new MiddlewareManager();
        await middlewareManager.listMiddleware();
      })
    );

  // -- Deployment Commands -----------------------------------------------
  const deployCmd = program
    .command('deploy')
    .alias('d')
    .description('Runtime deployment management');

  deployCmd
    .command('vercel')
    .description('Generate Vercel Edge deployment configuration')
    .option('--domain <domain>', 'Custom domain')
    .action(
      withErrorHandling('Deploy', async (options: DeployVercelOptions) => {
        const deployManager = new DeploymentManager();
        await deployManager.setupVercel(options);
      })
    );

  deployCmd
    .command('lambda')
    .description('Generate AWS Lambda deployment configuration')
    .option('--region <region>', 'AWS region', 'us-east-1')
    .option('--memory <memory>', 'Memory allocation (MB)', '512')
    .option('--timeout <timeout>', 'Timeout (seconds)', '30')
    .action(
      withErrorHandling('Deploy', async (options: DeployLambdaOptions) => {
        const deployManager = new DeploymentManager();
        await deployManager.setupLambda(options);
      })
    );

  deployCmd
    .command('workers')
    .description('Generate Cloudflare Workers deployment configuration')
    .option('--name <name>', 'Worker name')
    .action(
      withErrorHandling('Deploy', async (options: DeployWorkersOptions) => {
        const deployManager = new DeploymentManager();
        await deployManager.setupCloudflareWorkers(options);
      })
    );

  // -- Development Tools -------------------------------------------------
  program
    .command('dev')
    .description('Development server with hot reload')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('-h, --host <host>', 'Host address', 'localhost')
    .option('--watch <paths>', 'Additional paths to watch')
    .action(
      withErrorHandling('Dev', async (options: DevOptions) => {
        const devTools = new DevTools();
        await devTools.startDevServer(options);
      })
    );

  program
    .command('build')
    .description('Build project for production')
    .option('-t, --target <target>', 'Build target (node|edge|lambda|workers)', 'node')
    .option('-o, --output <dir>', 'Output directory', 'dist')
    .option('--minify', 'Minify output')
    .action(
      withErrorHandling('Build', async (options: BuildOptions) => {
        const devTools = new DevTools();
        await devTools.buildProject(options);
      })
    );

  program
    .command('lint')
    .description('Lint and format code')
    .option('--fix', 'Auto-fix issues')
    .action(
      withErrorHandling('Lint', async (options: LintOptions) => {
        const devTools = new DevTools();
        await devTools.lintProject(options);
      })
    );

  program
    .command('test')
    .description('Run tests')
    .option('--watch', 'Watch mode')
    .option('--coverage', 'Generate coverage report')
    .action(
      withErrorHandling('Test', async (options: TestOptions) => {
        const devTools = new DevTools();
        await devTools.runTests(options);
      })
    );

  // -- Security & Performance --------------------------------------------
  program
    .command('security:scan')
    .description('Scan project for security issues')
    .action(
      withErrorHandling('Security', async () => {
        const devTools = new DevTools();
        await devTools.securityScan();
      })
    );

  // -- Help & Examples ---------------------------------------------------
  program
    .command('examples')
    .description('Show usage examples')
    .action(() => {
      console.log(`
MoroJS CLI Examples
====================

Tip: Run any command with npx (no install required):
  npx @morojs/cli <command> [options]

Project Initialization
----------------------
  Interactive mode (no flags) — guided prompts step-by-step:
    npx @morojs/cli init my-api

  Non-interactive mode — pass ANY flag (or --fast) and the CLI fills in the
  rest with sensible defaults (runtime=node, database=none, template=api,
  validation=zod):
    npx @morojs/cli init my-api --fast
    npx @morojs/cli init my-api --validation=zod
    npx @morojs/cli init my-api --database=postgresql --features=auth,cors,docs
    npx @morojs/cli init my-chat-app --features=websocket,auth --websocket=socket.io --validation=joi
    npx @morojs/cli init my-edge-api --runtime=vercel-edge --template=microservice --validation=yup
    npx @morojs/cli init my-enterprise --validation=multiple --features=auth,websocket,docs

  Useful flags:
    --package-manager pnpm   Use pnpm or yarn instead of npm
    --dry-run                Preview the project without writing any files
    --force                  Overwrite an existing directory non-interactively

Module Creation
---------------
  npx @morojs/cli module create users --features=database,auth,cache --with-tests
  npx @morojs/cli module create orders --database=mongodb --middleware=auth,rate-limit

Configuration
-------------
  npx @morojs/cli config init --environment=production --database=mysql
  npx @morojs/cli config validate
  npx @morojs/cli config env --environment=staging

Database
--------
  npx @morojs/cli db setup postgresql --host=localhost --database=myapp
  npx @morojs/cli db migrate --up
  npx @morojs/cli db seed --environment=development

Development
-----------
  npx @morojs/cli dev --port=3000 --watch=./modules
  npx @morojs/cli build --target=lambda --minify
  npx @morojs/cli test --watch --coverage

Deployment
----------
  npx @morojs/cli deploy vercel --domain=myapi.vercel.app
  npx @morojs/cli deploy lambda --region=us-west-2 --memory=1024
  npx @morojs/cli deploy workers --name=my-worker

Middleware
----------
  npx @morojs/cli middleware add auth --config='{"roles":["admin","user"]}'
  npx @morojs/cli middleware list

For complete docs: https://morojs.com/cli
      `);
    });

  await program.parseAsync(process.argv);
}

// Legacy export for backward compatibility
export async function runModuleStubGenerator(): Promise<void> {
  console.log('WARNING: Legacy entry point detected. Please use "morojs-cli" instead.');
  await runCLI();
}

if (require.main === module) {
  runCLI().catch(error => {
    logger.error(`CLI Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'CLI');
    process.exit(1);
  });
}
