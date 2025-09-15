#!/usr/bin/env node

// MoroJS CLI - Comprehensive Development Toolkit
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createFrameworkLogger } from './logger';
import { ModuleStubGenerator } from './module-stub-generator';
import { ProjectInitializer } from './commands/init';
import { ConfigManager } from './commands/config';
import { DatabaseManager } from './commands/database';
import { DeploymentManager } from './commands/deploy';
import { DevTools } from './commands/dev';
import { MiddlewareManager } from './commands/middleware';

const logger = createFrameworkLogger('MoroJS-CLI');

// Read version from package.json
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

export async function runCLI(): Promise<void> {
  const program = new Command();

  program
    .name('morojs-cli')
    .description('MoroJS Framework - Comprehensive Development Toolkit')
    .version(version)
    .option('--verbose', 'Enable verbose logging')
    .option('--quiet', 'Suppress all output except errors')
    .hook('preAction', (thisCommand: any) => {
      if (thisCommand.opts().verbose) {
        process.env.LOG_LEVEL = 'debug';
      }
      if (thisCommand.opts().quiet) {
        process.env.LOG_LEVEL = 'error';
      }
    });

  // Project Initialization
  program
    .command('init <project-name>')
    .description('Initialize a new MoroJS project')
    .option(
      '-r, --runtime <type>',
      'Runtime adapter (node|vercel-edge|aws-lambda|cloudflare-workers)',
      'node'
    )
    .option(
      '-d, --database <type>',
      'Database adapter (mysql|postgresql|sqlite|mongodb|redis|drizzle)'
    )
    .option(
      '-f, --features <features>',
      'Comma-separated features (auth,cors,helmet,compression,websocket,docs)'
    )
    .option(
      '-w, --websocket <adapter>',
      'WebSocket adapter (auto-detect|socket.io|ws|none)',
      'auto-detect'
    )
    .option(
      '-v, --validation <library>',
      'Validation library (zod|joi|yup|class-validator|multiple)',
      'zod'
    )
    .option('-t, --template <template>', 'Project template (api|fullstack|microservice)', 'api')
    .option('--skip-git', 'Skip Git repository initialization')
    .option('--skip-install', 'Skip npm install')
    .action(async (projectName: string, options: any) => {
      try {
        const initializer = new ProjectInitializer();
        await initializer.initializeProject(projectName, options);
      } catch (error) {
        logger.error(
          `Failed to initialize project: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Init'
        );
        process.exit(1);
      }
    });

  // Module Generation (Enhanced)
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
    .action(async (name: string, options: any) => {
      try {
        const generator = new ModuleStubGenerator();
        await generator.generateAdvancedModule(name, options);
      } catch (error) {
        logger.error(
          `Failed to generate module: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Module'
        );
        process.exit(1);
      }
    });

  moduleCmd
    .command('list')
    .description('List all modules in the project')
    .action(async () => {
      try {
        const generator = new ModuleStubGenerator();
        await generator.listModules();
      } catch (error) {
        logger.error(
          `Failed to list modules: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Module'
        );
        process.exit(1);
      }
    });

  // Configuration Management
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
    .action(async (options: any) => {
      try {
        const configManager = new ConfigManager();
        await configManager.initializeConfig(options);
      } catch (error) {
        logger.error(
          `Failed to initialize config: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Config'
        );
        process.exit(1);
      }
    });

  configCmd
    .command('validate')
    .description('Validate existing configuration')
    .action(async () => {
      try {
        const configManager = new ConfigManager();
        await configManager.validateConfig();
      } catch (error) {
        logger.error(
          `Config validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Config'
        );
        process.exit(1);
      }
    });

  configCmd
    .command('env')
    .description('Generate .env template with all available options')
    .option('-e, --environment <env>', 'Environment type', 'development')
    .action(async (options: any) => {
      try {
        const configManager = new ConfigManager();
        await configManager.generateEnvTemplate(options);
      } catch (error) {
        logger.error(
          `Failed to generate env template: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Config'
        );
        process.exit(1);
      }
    });

  // Database Management
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
    .action(async (type: string, options: any) => {
      try {
        const dbManager = new DatabaseManager();
        await dbManager.setupAdapter(type, options);
      } catch (error) {
        logger.error(
          `Failed to setup database: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Database'
        );
        process.exit(1);
      }
    });

  dbCmd
    .command('migrate')
    .description('Run database migrations')
    .option('--up', 'Run migrations up')
    .option('--down', 'Run migrations down')
    .option('--reset', 'Reset all migrations')
    .action(async (options: any) => {
      try {
        const dbManager = new DatabaseManager();
        await dbManager.runMigrations(options);
      } catch (error) {
        logger.error(
          `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Database'
        );
        process.exit(1);
      }
    });

  dbCmd
    .command('seed')
    .description('Run database seeds')
    .option('-e, --environment <env>', 'Environment', 'development')
    .action(async (options: any) => {
      try {
        const dbManager = new DatabaseManager();
        await dbManager.runSeeds(options);
      } catch (error) {
        logger.error(
          `Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Database'
        );
        process.exit(1);
      }
    });

  // Middleware Management
  const middlewareCmd = program
    .command('middleware')
    .alias('mw')
    .description('Middleware management');

  middlewareCmd
    .command('add <type>')
    .description('Add built-in middleware configuration')
    .option('-c, --config <config>', 'Middleware configuration (JSON string)')
    .action(async (type: string, options: any) => {
      try {
        const middlewareManager = new MiddlewareManager();
        await middlewareManager.addMiddleware(type, options);
      } catch (error) {
        logger.error(
          `Failed to add middleware: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Middleware'
        );
        process.exit(1);
      }
    });

  middlewareCmd
    .command('list')
    .description('List available built-in middleware')
    .action(async () => {
      try {
        const middlewareManager = new MiddlewareManager();
        await middlewareManager.listMiddleware();
      } catch (error) {
        logger.error(
          `Failed to list middleware: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Middleware'
        );
        process.exit(1);
      }
    });

  // Deployment Commands
  const deployCmd = program
    .command('deploy')
    .alias('d')
    .description('Runtime deployment management');

  deployCmd
    .command('vercel')
    .description('Generate Vercel Edge deployment configuration')
    .option('--domain <domain>', 'Custom domain')
    .action(async (options: any) => {
      try {
        const deployManager = new DeploymentManager();
        await deployManager.setupVercel(options);
      } catch (error) {
        logger.error(
          `Vercel deployment setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Deploy'
        );
        process.exit(1);
      }
    });

  deployCmd
    .command('lambda')
    .description('Generate AWS Lambda deployment configuration')
    .option('--region <region>', 'AWS region', 'us-east-1')
    .option('--memory <memory>', 'Memory allocation (MB)', '512')
    .option('--timeout <timeout>', 'Timeout (seconds)', '30')
    .action(async (options: any) => {
      try {
        const deployManager = new DeploymentManager();
        await deployManager.setupLambda(options);
      } catch (error) {
        logger.error(
          `Lambda deployment setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Deploy'
        );
        process.exit(1);
      }
    });

  deployCmd
    .command('workers')
    .description('Generate Cloudflare Workers deployment configuration')
    .option('--name <name>', 'Worker name')
    .action(async (options: any) => {
      try {
        const deployManager = new DeploymentManager();
        await deployManager.setupCloudflareWorkers(options);
      } catch (error) {
        logger.error(
          `Workers deployment setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Deploy'
        );
        process.exit(1);
      }
    });

  // Development Tools
  const devCmd = program
    .command('dev')
    .description('Development server with hot reload')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('-h, --host <host>', 'Host address', 'localhost')
    .option('--watch <paths>', 'Additional paths to watch')
    .action(async (options: any) => {
      try {
        const devTools = new DevTools();
        await devTools.startDevServer(options);
      } catch (error) {
        logger.error(
          `Dev server failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Dev'
        );
        process.exit(1);
      }
    });

  program
    .command('build')
    .description('Build project for production')
    .option('-t, --target <target>', 'Build target (node|edge|lambda|workers)', 'node')
    .option('-o, --output <dir>', 'Output directory', 'dist')
    .option('--minify', 'Minify output')
    .action(async (options: any) => {
      try {
        const devTools = new DevTools();
        await devTools.buildProject(options);
      } catch (error) {
        logger.error(
          `Build failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Build'
        );
        process.exit(1);
      }
    });

  program
    .command('lint')
    .description('Lint and format code')
    .option('--fix', 'Auto-fix issues')
    .action(async (options: any) => {
      try {
        const devTools = new DevTools();
        await devTools.lintProject(options);
      } catch (error) {
        logger.error(
          `Linting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Lint'
        );
        process.exit(1);
      }
    });

  program
    .command('test')
    .description('Run tests')
    .option('--watch', 'Watch mode')
    .option('--coverage', 'Generate coverage report')
    .action(async (options: any) => {
      try {
        const devTools = new DevTools();
        await devTools.runTests(options);
      } catch (error) {
        logger.error(
          `Tests failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Test'
        );
        process.exit(1);
      }
    });

  // Security & Performance
  program
    .command('security:scan')
    .description('Scan project for security issues')
    .action(async () => {
      try {
        const devTools = new DevTools();
        await devTools.securityScan();
      } catch (error) {
        logger.error(
          `Security scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Security'
        );
        process.exit(1);
      }
    });

  // Help and examples
  program
    .command('examples')
    .description('Show usage examples')
    .action(() => {
      console.log(`
MoroJS CLI Examples:

Project Initialization:
  morojs-cli init my-api --runtime=node --database=postgresql --features=auth,cors,docs
  morojs-cli init my-chat-app --features=websocket,auth --websocket=socket.io --validation=joi
  morojs-cli init my-edge-api --runtime=vercel-edge --template=microservice --websocket=ws --validation=yup
  morojs-cli init my-enterprise --validation=multiple --features=auth,websocket,docs

Module Creation:
  morojs-cli module create users --features=database,auth,cache --with-tests
  morojs-cli module create orders --database=mongodb --middleware=auth,rate-limit

Configuration:
  morojs-cli config init --environment=production --database=mysql
  morojs-cli config validate
  morojs-cli config env --environment=staging

Database:
  morojs-cli db setup postgresql --host=localhost --database=myapp
  morojs-cli db migrate --up
  morojs-cli db seed --environment=development

Development:
  morojs-cli dev --port=3000 --watch=./modules
  morojs-cli build --target=lambda --minify
  morojs-cli test --watch --coverage

Deployment:
  morojs-cli deploy vercel --domain=myapi.vercel.app
  morojs-cli deploy lambda --region=us-west-2 --memory=1024
  morojs-cli deploy workers --name=my-worker

Middleware:
  morojs-cli middleware add auth --config='{"roles":["admin","user"]}'
  morojs-cli middleware list
      `);
    });

  // Parse arguments
  await program.parseAsync(process.argv);
}

// Legacy export for backward compatibility
export async function runModuleStubGenerator(): Promise<void> {
  console.log('WARNING: Legacy entry point detected. Please use "morojs-cli" instead.');
  await runCLI();
}

// Run CLI if this file is executed directly
if (require.main === module) {
  runCLI().catch(error => {
    console.error('CLI Error:', error);
    process.exit(1);
  });
}
