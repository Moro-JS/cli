// Project Initialization - Create new MoroJS projects with intelligent setup
import { writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { createFrameworkLogger } from '../logger';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import figlet from 'figlet';
import { runTerminalCmd } from '../utils/terminal';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProjectInitOptions {
  runtime?: 'node' | 'vercel-edge' | 'aws-lambda' | 'cloudflare-workers';
  database?: 'mysql' | 'postgresql' | 'sqlite' | 'mongodb' | 'redis' | 'drizzle';
  features?: string;
  template?: 'api' | 'fullstack' | 'microservice';
  skipGit?: boolean;
  skipInstall?: boolean;
}

export class ProjectInitializer {
  private logger = createFrameworkLogger('ProjectInitializer');

  async initializeProject(projectName: string, options: ProjectInitOptions): Promise<void> {
    // Welcome banner
    console.log(chalk.cyan(figlet.textSync('MoroJS', { horizontalLayout: 'full' })));
    console.log(
      boxen(chalk.green('Creating your magical MoroJS project...'), {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
      })
    );

    const projectPath = resolve(process.cwd(), projectName);

    // Check if directory already exists
    if (existsSync(projectPath)) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Directory "${projectName}" already exists. Overwrite?`,
          default: false,
        },
      ]);

      if (!overwrite) {
        this.logger.info('Project initialization cancelled.', 'Init');
        return;
      }
    }

    // Interactive prompts if options not provided
    const config = await this.gatherProjectConfig(options);

    const spinner = ora('Creating project structure...').start();

    try {
      // Create project directory
      await mkdir(projectPath, { recursive: true });

      // Generate project files
      await Promise.all([
        this.generatePackageJson(projectPath, projectName, config),
        this.generateTsConfig(projectPath),
        this.generateMainApp(projectPath, config),
        this.generateEnvFiles(projectPath, config),
        this.generateMoroConfig(projectPath, config),
        this.generateGitignore(projectPath),
        this.generateReadme(projectPath, projectName, config),
        this.generateDockerfile(projectPath, config),
        this.generateProjectStructure(projectPath, config),
      ]);

      spinner.succeed('Project structure created!');

      // Initialize git repository
      if (!config.skipGit) {
        const gitSpinner = ora('Initializing Git repository...').start();
        try {
          await runTerminalCmd('git init', { cwd: projectPath });
          await runTerminalCmd('git add .', { cwd: projectPath });
          await runTerminalCmd('git commit -m "Initial commit: MoroJS project setup"', {
            cwd: projectPath,
          });
          gitSpinner.succeed('Git repository initialized!');
        } catch (error) {
          gitSpinner.warn('Git initialization skipped (git not available)');
        }
      }

      // Install dependencies
      if (!config.skipInstall) {
        const installSpinner = ora('Installing dependencies...').start();
        try {
          await runTerminalCmd('npm install', { cwd: projectPath });
          installSpinner.succeed('Dependencies installed!');
        } catch (error) {
          installSpinner.fail('Failed to install dependencies. Run "npm install" manually.');
        }
      }

      // Success message with next steps
      this.displaySuccessMessage(projectName, config);
    } catch (error) {
      spinner.fail('Project creation failed!');
      throw error;
    }
  }

  private async gatherProjectConfig(
    options: ProjectInitOptions
  ): Promise<Required<ProjectInitOptions> & { features: string[] }> {
    const questions = [];

    if (!options.runtime) {
      questions.push({
        type: 'list',
        name: 'runtime',
        message: 'Select runtime adapter:',
        choices: [
          { name: ' Node.js (Traditional server)', value: 'node' },
          { name: 'Vercel Edge (Edge runtime)', value: 'vercel-edge' },
          { name: 'AWS Lambda (Serverless)', value: 'aws-lambda' },
          { name: ' Cloudflare Workers (Edge workers)', value: 'cloudflare-workers' },
        ],
        default: 'node',
      });
    }

    if (!options.database) {
      questions.push({
        type: 'list',
        name: 'database',
        message: ' Select primary database:',
        choices: [
          { name: 'PostgreSQL (Recommended)', value: 'postgresql' },
          { name: 'MySQL/MariaDB', value: 'mysql' },
          { name: 'SQLite (Lightweight)', value: 'sqlite' },
          { name: 'MongoDB (Document DB)', value: 'mongodb' },
          { name: 'Redis (Cache/Sessions)', value: 'redis' },
          { name: 'Drizzle ORM (Type-safe)', value: 'drizzle' },
          { name: '❌ Skip database setup', value: 'none' },
        ],
      });
    }

    if (!options.template) {
      questions.push({
        type: 'list',
        name: 'template',
        message: 'Select project template:',
        choices: [
          { name: 'API Server (REST/GraphQL)', value: 'api' },
          { name: 'Full-stack (API + Frontend)', value: 'fullstack' },
          { name: 'Microservice (Minimal)', value: 'microservice' },
        ],
        default: 'api',
      });
    }

    if (!options.features) {
      questions.push({
        type: 'checkbox',
        name: 'features',
        message: 'Select features to include:',
        choices: [
          { name: 'Authentication & Authorization', value: 'auth' },
          { name: ' CORS & Security Headers', value: 'cors', checked: true },
          { name: ' Compression & Performance', value: 'compression', checked: true },
          { name: 'WebSocket Support', value: 'websocket' },
          { name: 'API Documentation (OpenAPI)', value: 'docs' },
          { name: 'Rate Limiting', value: 'rate-limit' },
          { name: 'Caching Layer', value: 'cache' },
          { name: 'Circuit Breaker', value: 'circuit-breaker' },
          { name: 'Monitoring & Metrics', value: 'monitoring' },
          { name: 'Testing Setup', value: 'testing' },
        ],
      });
    }

    const answers = await inquirer.prompt(questions);

    return {
      runtime: options.runtime || answers.runtime,
      database: options.database || answers.database,
      template: options.template || answers.template,
      features: options.features ? options.features.split(',') : answers.features || [],
      skipGit: options.skipGit || false,
      skipInstall: options.skipInstall || false,
    };
  }

  private async generatePackageJson(
    projectPath: string,
    projectName: string,
    config: any
  ): Promise<void> {
    const packageJson = {
      name: projectName,
      version: '1.0.0',
      description: `MoroJS ${config.template} project`,
      type: 'module',
      main: 'dist/src/index.js',
      scripts: {
        dev: 'tsx src/index.ts',
        build: 'tsc',
        start: 'node dist/src/index.js',
        test: 'morojs-cli test',
        lint: 'morojs-cli lint',
        'db:migrate': 'morojs-cli db migrate --up',
        'db:seed': 'morojs-cli db seed',
        ...(config.runtime === 'vercel-edge' && { 'deploy:vercel': 'morojs-cli deploy vercel' }),
        ...(config.runtime === 'aws-lambda' && { 'deploy:lambda': 'morojs-cli deploy lambda' }),
        ...(config.runtime === 'cloudflare-workers' && {
          'deploy:workers': 'morojs-cli deploy workers',
        }),
      },
      dependencies: {
        '@morojs/moro': await this.getLatestPackageVersion('@morojs/moro'),
        ...(config.database === 'postgresql' && { pg: '^8.11.3', '@types/pg': '^8.10.9' }),
        ...(config.database === 'mysql' && { mysql2: '^3.6.5' }),
        ...(config.database === 'mongodb' && { mongodb: '^6.3.0' }),
        ...(config.database === 'redis' && { redis: '^4.6.10' }),
        ...(config.database === 'drizzle' && {
          'drizzle-orm': '^0.29.1',
          'drizzle-kit': '^0.20.6',
        }),
        ...(config.features.includes('auth') && {
          bcryptjs: '^2.4.3',
        }),
        ...(config.features.includes('docs') && {
          'swagger-ui-dist': '^5.11.0',
        }),
        zod: '^3.22.4',
      },
      devDependencies: {
        '@morojs/cli': '^1.0.0',
        '@types/node': '^20.10.0',
        typescript: '^5.3.2',
        tsx: '^4.7.0',
        ...(config.features.includes('auth') && {
          '@types/bcryptjs': '^2.4.0',
        }),
        ...(config.features.includes('testing') && {
          jest: '^29.7.0',
          '@types/jest': '^29.5.8',
          'ts-jest': '^29.1.1',
          supertest: '^6.3.3',
          '@types/supertest': '^2.0.16',
        }),
      },
      engines: {
        node: '>=18.0.0',
      },
    };

    await writeFile(join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));
  }

  private async generateTsConfig(projectPath: string): Promise<void> {
    const tsConfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'node',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        outDir: './dist',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        removeComments: false,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        resolveJsonModule: true,
        allowSyntheticDefaultImports: true,
      },
      include: ['src/**/*', 'moro.config.ts'],
      exclude: ['node_modules', 'dist', '**/*.test.ts', '**/*.spec.ts'],
    };

    await writeFile(join(projectPath, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
  }

  private async generateMainApp(projectPath: string, config: any): Promise<void> {
    await mkdir(join(projectPath, 'src'), { recursive: true });

    const runtimeImports: Record<string, string> = {
      node: 'createAppNode',
      'vercel-edge': 'createAppEdge',
      'aws-lambda': 'createAppLambda',
      'cloudflare-workers': 'createAppWorker',
    };

    const appContent = `// ${config.template.toUpperCase()} MoroJS Application
import { ${runtimeImports[config.runtime as keyof typeof runtimeImports]}, logger, initializeConfig } from '@morojs/moro';
${config.database !== 'none' ? `import { setupDatabase } from './database/index.js';` : ''}
${config.features.includes('auth') ? `import { setupAuth } from './middleware/auth.js';` : ''}

// Initialize configuration from moro.config.js and environment variables
const appConfig = initializeConfig();

// Create MoroJS application with ${config.runtime} runtime
const app = ${runtimeImports[config.runtime as keyof typeof runtimeImports]}({
  ${config.features.includes('cors') ? `cors: true,` : ''}
  ${config.features.includes('compression') ? `compression: true,` : ''}
  logger: {
    level: appConfig.logging?.level || 'info',
    format: appConfig.logging?.format || 'pretty'
  }
});

// Database setup
${config.database !== 'none' ? `await setupDatabase(app);` : ''}

// Auth setup
${config.features.includes('auth') ? `await setupAuth(app);` : ''}

// Health check endpoint
app.get('/health')
  .describe('Health check endpoint to verify API status')
  .tag('System')
  .handler(async (req: any, res: any) => {
    return {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      runtime: '${config.runtime}',
      version: '1.0.0'
    };
  });

// Welcome endpoint
app.get('/')
  .describe('Welcome endpoint with API information and available routes')
  .tag('General')
  .handler(async (req: any, res: any) => {
    return {
      message: 'Welcome to your MoroJS ${config.template}!',
      docs: '/docs',
      health: '/health',
      auth: {
        login: '/auth/login',
        register: '/auth/register',
        profile: '/auth/profile'
      }
    };
  });

// Auth endpoints
app.post('/auth/login')
  .describe('Login with email and password')
  .tag('Auth')
  .handler(async (req: any, res: any) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400);
      return {
        success: false,
        error: 'Email and password are required'
      };
    }

    try {
      console.log('Login attempt:', { email });
      const result = await req.auth.signIn('credentials', { email, password });
      console.log('Login result:', { success: !!result });

      if (!result) {
        res.status(401);
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }

      const token = await req.auth.createToken(result);
      await req.auth.setSession({ user: result, token });

      return {
        success: true,
        data: {
          user: result,
          token
        }
      };
    } catch (error) {
      console.error('Auth error:', error);
      res.status(401);
      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  });

app.post('/auth/register')
  .describe('Register a new user')
  .tag('Auth')
  .handler(async (req: any, res: any) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      res.status(400);
      return {
        success: false,
        error: 'Email, password, and name are required'
      };
    }

    // In a real app, you would hash the password and store in a database
    return {
      success: true,
      message: 'Registration successful. Please login.'
    };
  });

app.get('/auth/profile')
  .describe('Get authenticated user profile')
  .tag('Auth')
  .handler(async (req: any, res: any) => {
    const user = await req.auth.getUser();
    if (!user) {
      res.status(401);
      return {
        success: false,
        error: 'Not authenticated'
      };
    }

    return {
      success: true,
      data: {
        user,
        session: req.auth.session
      }
    };
  });

${
  config.features.includes('docs')
    ? `
// API Documentation
app.enableDocs({
  title: '${config.template.charAt(0).toUpperCase() + config.template.slice(1)} API',
  description: 'MoroJS ${config.template} application',
  version: '1.0.0',
  basePath: '/docs',
  swaggerUI: {
    enableTryItOut: false,
    enableFilter: false,
    enableDeepLinking: false,
    customCss: \`
      .swagger-ui .topbar { display: none }
      .swagger-ui .scheme-container { display: none }
      .swagger-ui .info { margin: 20px 0 }
      .swagger-ui .info .title { font-size: 24px }
      .swagger-ui .info .title small { display: none }
      .swagger-ui .info .title span { display: none }
      .swagger-ui .information-container { padding: 0 }
      .swagger-ui section.models { display: none }
      .swagger-ui .auth-wrapper { display: none }
      .swagger-ui .try-out { display: none }
    \`
  },
});
`
    : ''
}
// Auto-discover and load modules
// Modules will be automatically loaded from ./modules directory

${
  config.runtime === 'node'
    ? `
// Start server (Node.js only)
const PORT = appConfig.server?.port || 3000;
const HOST = appConfig.server?.host || 'localhost';

app.listen(PORT, HOST, () => {
  logger.info(\`${config.template.charAt(0).toUpperCase() + config.template.slice(1)} server running!\`);
  logger.info(\`HTTP: http://\${HOST}:\${PORT}\`);
  ${config.features.includes('websocket') ? `logger.info(\`🔌 WebSocket: ws://\${HOST}:\${PORT}\`);` : ''}
  ${config.features.includes('docs') ? `logger.info(\`Docs: http://\${HOST}:\${PORT}/docs\`);` : ''}
});
`
    : `
// Export handler for ${config.runtime}
export default app.getHandler();
`
}

export { app };`;

    await writeFile(join(projectPath, 'src', 'index.ts'), appContent);
  }

  private async generateEnvFiles(projectPath: string, config: any): Promise<void> {
    const envContent = `# MoroJS ${config.template.toUpperCase()} Configuration

# Server Configuration
NODE_ENV=development
PORT=3000
HOST=localhost
LOG_LEVEL=info

# Database Configuration
${
  config.database === 'postgresql'
    ? `
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=username
POSTGRES_PASSWORD=password
POSTGRES_DB=database_name`
    : ''
}
${
  config.database === 'mysql'
    ? `
DATABASE_URL=mysql://username:password@localhost:3306/database_name
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=username
MYSQL_PASSWORD=password
MYSQL_DATABASE=database_name`
    : ''
}
${
  config.database === 'mongodb'
    ? `
DATABASE_URL=mongodb://localhost:27017/database_name
MONGODB_URI=mongodb://localhost:27017/database_name`
    : ''
}
${
  config.database === 'redis'
    ? `
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379`
    : ''
}

# Security Configuration
${
  config.features.includes('auth')
    ? `
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12`
    : ''
}

# External Services (Optional)
${
  config.features.includes('monitoring')
    ? `
# Monitoring
SENTRY_DSN=
NEW_RELIC_LICENSE_KEY=`
    : ''
}

# Runtime-specific Configuration
${
  config.runtime === 'aws-lambda'
    ? `
AWS_REGION=us-east-1
AWS_LAMBDA_FUNCTION_NAME=${config.name}`
    : ''
}
${
  config.runtime === 'cloudflare-workers'
    ? `
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=`
    : ''
}
`;

    await writeFile(join(projectPath, '.env'), envContent);
    await writeFile(join(projectPath, '.env.example'), envContent.replace(/=.*/g, '='));
  }

  private async generateMoroConfig(projectPath: string, config: any): Promise<void> {
    const configContent = `// MoroJS Configuration
// Generated based on selected features: ${config.features.join(', ')}
// Reference: https://morojs.com/docs/configuration

export default {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || process.env.MORO_PORT || '3000'),
    host: process.env.HOST || process.env.MORO_HOST || 'localhost',
    environment: process.env.NODE_ENV || process.env.MORO_ENV || 'development'${
      config.runtime === 'node'
        ? `,
    maxConnections: parseInt(process.env.MAX_CONNECTIONS || process.env.MORO_MAX_CONNECTIONS || '1000'),
    timeout: parseInt(process.env.REQUEST_TIMEOUT || process.env.MORO_TIMEOUT || '30000')`
        : ''
    }
  },

${
  config.database !== 'none' && config.database !== 'sqlite'
    ? `  // Database Configuration
  database: {${
    config.database === 'postgresql'
      ? `
    url: process.env.DATABASE_URL || process.env.MORO_DATABASE_URL`
      : ''
  }${
    config.database === 'mysql'
      ? `
    mysql: {
      host: process.env.MYSQL_HOST || process.env.MORO_MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || process.env.MORO_MYSQL_PORT || '3306'),
      database: process.env.MYSQL_DATABASE || process.env.MORO_MYSQL_DB,
      username: process.env.MYSQL_USERNAME || process.env.MORO_MYSQL_USER,
      password: process.env.MYSQL_PASSWORD || process.env.MORO_MYSQL_PASS,
      connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || process.env.MORO_MYSQL_CONNECTIONS || '10'),
      acquireTimeout: parseInt(process.env.MYSQL_ACQUIRE_TIMEOUT || '60000'),
      timeout: parseInt(process.env.MYSQL_TIMEOUT || '60000')
    }`
      : ''
  }${
    config.database === 'mongodb'
      ? `
    url: process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MORO_DATABASE_URL || 'mongodb://localhost:27017/database'`
      : ''
  }${
    config.database === 'redis' || config.features.includes('cache')
      ? `,
    redis: {
      url: process.env.REDIS_URL || process.env.MORO_REDIS_URL || 'redis://localhost:6379',
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || process.env.MORO_REDIS_RETRIES || '3'),
      retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || process.env.MORO_REDIS_DELAY || '1000'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || process.env.MORO_REDIS_PREFIX || 'moro:'
    }`
      : ''
  }
  },

`
    : ''
}  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || process.env.MORO_LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || process.env.MORO_LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty'),
    enableColors: process.env.LOG_COLORS !== 'false' && process.env.NO_COLOR !== '1' && process.env.NODE_ENV !== 'production',
    enableTimestamp: process.env.LOG_TIMESTAMP !== 'false',
    enableContext: process.env.LOG_CONTEXT !== 'false'${
      config.features.includes('monitoring')
        ? `,
    outputs: {
      console: true,
      file: {
        enabled: process.env.LOG_FILE_ENABLED === 'true' || process.env.MORO_LOG_FILE === 'true' || process.env.NODE_ENV === 'production',
        path: process.env.LOG_FILE_PATH || process.env.MORO_LOG_PATH || './logs/moro.log',
        maxSize: '10MB',
        maxFiles: 5
      }${
        config.features.includes('webhook-logging')
          ? `,
      webhook: {
        enabled: !!process.env.LOG_WEBHOOK_URL || !!process.env.MORO_LOG_WEBHOOK_URL,
        url: process.env.LOG_WEBHOOK_URL || process.env.MORO_LOG_WEBHOOK_URL,
        headers: {
          'Authorization': process.env.LOG_WEBHOOK_AUTH,
          'Content-Type': 'application/json'
        }
      }`
          : ''
      }
    }`
        : ''
    }
  },

  // Security Configuration
  security: {
    cors: {
      enabled: ${config.features.includes('cors') ? "process.env.CORS_ENABLED !== 'false'" : 'false'},${
        config.features.includes('cors')
          ? `
      origin: process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGIN || process.env.MORO_CORS_ORIGIN || '*').split(',')
        : '*',
      methods: (process.env.CORS_METHODS || process.env.MORO_CORS_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS').split(','),
      allowedHeaders: (process.env.CORS_HEADERS || process.env.MORO_CORS_HEADERS || 'Content-Type,Authorization').split(','),
      credentials: process.env.CORS_CREDENTIALS === 'true'`
          : ''
      }
    },
    helmet: {
      enabled: process.env.HELMET_ENABLED !== 'false',
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      hsts: process.env.NODE_ENV === 'production',
      noSniff: true,
      frameguard: true
    }${
      config.features.includes('rate-limit')
        ? `,
    rateLimit: {
      enabled: process.env.GLOBAL_RATE_LIMIT_ENABLED === 'true',
      requests: parseInt(process.env.GLOBAL_RATE_LIMIT_REQUESTS || process.env.MORO_GLOBAL_RATE_REQUESTS || '1000'),
      window: 60000 // 1 minute window
    }`
        : ''
    }
  },

${
  config.features.includes('compression') ||
  config.features.includes('circuit-breaker') ||
  config.runtime === 'node'
    ? `  // Performance Configuration
  performance: {${
    config.features.includes('compression')
      ? `
    compression: {
      enabled: process.env.COMPRESSION_ENABLED !== 'false',
      level: parseInt(process.env.COMPRESSION_LEVEL || process.env.MORO_COMPRESSION_LEVEL || '6'),
      threshold: parseInt(process.env.COMPRESSION_THRESHOLD || process.env.MORO_COMPRESSION_THRESHOLD || '1024')
    }${config.features.includes('circuit-breaker') || config.runtime === 'node' ? ',' : ''}`
      : ''
  }${
    config.features.includes('circuit-breaker')
      ? `
    circuitBreaker: {
      enabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
      failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || process.env.MORO_CB_THRESHOLD || '5'),
      resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '60000'),
      monitoringPeriod: parseInt(process.env.CIRCUIT_BREAKER_MONITORING_PERIOD || '10000')
    }${config.runtime === 'node' ? ',' : ''}`
      : ''
  }${
    config.runtime === 'node'
      ? `
    clustering: {
      enabled: process.env.CLUSTERING_ENABLED === 'true',
      workers: parseInt(process.env.CLUSTER_WORKERS || process.env.MORO_WORKERS || '0') || 'auto'
    }`
      : ''
  }
  },

`
    : ''
}${
      config.features.some((f: string) => ['cache', 'rate-limit', 'validation'].includes(f))
        ? `
  // Module Configuration
  modules: {${
    config.features.includes('cache')
      ? `
    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false' || process.env.MORO_CACHE_ENABLED !== 'false',
      defaultTtl: parseInt(process.env.DEFAULT_CACHE_TTL || process.env.MORO_CACHE_TTL || '300'),
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || process.env.MORO_CACHE_SIZE || '1000'),
      strategy: process.env.CACHE_STRATEGY || process.env.MORO_CACHE_STRATEGY || 'lru'
    }${config.features.includes('rate-limit') || config.features.includes('validation') ? ',' : ''}`
      : ''
  }${
    config.features.includes('rate-limit')
      ? `
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false' || process.env.MORO_RATE_LIMIT_ENABLED !== 'false',
      defaultRequests: parseInt(process.env.DEFAULT_RATE_LIMIT_REQUESTS || process.env.MORO_RATE_LIMIT_REQUESTS || '100'),
      defaultWindow: parseInt(process.env.DEFAULT_RATE_LIMIT_WINDOW || process.env.MORO_RATE_LIMIT_WINDOW || '60000'),
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
      skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true'
    }${config.features.includes('validation') ? ',' : ''}`
      : ''
  }${
    config.features.includes('validation')
      ? `
    validation: {
      enabled: process.env.VALIDATION_ENABLED !== 'false' || process.env.MORO_VALIDATION_ENABLED !== 'false',
      stripUnknown: process.env.VALIDATION_STRIP_UNKNOWN !== 'false',
      abortEarly: process.env.VALIDATION_ABORT_EARLY === 'true'
    }`
      : ''
  }
  }`
        : ''
    }${
      config.features.includes('service-discovery')
        ? `,

  // Service Discovery Configuration
  serviceDiscovery: {
    enabled: process.env.SERVICE_DISCOVERY_ENABLED === 'true' || process.env.MORO_SERVICE_DISCOVERY === 'true',
    type: process.env.DISCOVERY_TYPE || process.env.MORO_DISCOVERY_TYPE || 'memory',
    consulUrl: process.env.CONSUL_URL || process.env.MORO_CONSUL_URL || 'http://localhost:8500',
    kubernetesNamespace: process.env.K8S_NAMESPACE || process.env.MORO_K8S_NAMESPACE || 'default',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || process.env.MORO_HEALTH_INTERVAL || '30000'),
    retryAttempts: parseInt(process.env.DISCOVERY_RETRY_ATTEMPTS || process.env.MORO_DISCOVERY_RETRIES || '3')
  }`
        : ''
    }${
      config.features.some((f: string) => ['stripe', 'paypal', 'smtp', 'email'].includes(f))
        ? `,

  // External Services Configuration
  external: {${
    config.features.includes('stripe')
      ? `
    // Stripe Configuration (uncomment and configure)
    // stripe: {
    //   secretKey: process.env.STRIPE_SECRET_KEY || process.env.MORO_STRIPE_SECRET,
    //   publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || process.env.MORO_STRIPE_PUBLIC,
    //   webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || process.env.MORO_STRIPE_WEBHOOK,
    //   apiVersion: process.env.STRIPE_API_VERSION || process.env.MORO_STRIPE_VERSION || '2023-10-16'
    // }${config.features.includes('paypal') || config.features.includes('smtp') ? ',' : ''}`
      : ''
  }${
    config.features.includes('paypal')
      ? `
    // PayPal Configuration (uncomment and configure)
    // paypal: {
    //   clientId: process.env.PAYPAL_CLIENT_ID || process.env.MORO_PAYPAL_CLIENT,
    //   clientSecret: process.env.PAYPAL_CLIENT_SECRET || process.env.MORO_PAYPAL_SECRET,
    //   webhookId: process.env.PAYPAL_WEBHOOK_ID,
    //   environment: process.env.PAYPAL_ENVIRONMENT || process.env.MORO_PAYPAL_ENV || 'sandbox'
    // }${config.features.includes('smtp') ? ',' : ''}`
      : ''
  }${
    config.features.includes('smtp') || config.features.includes('email')
      ? `
    // SMTP Configuration (uncomment and configure)
    // smtp: {
    //   host: process.env.SMTP_HOST || process.env.MORO_SMTP_HOST,
    //   port: parseInt(process.env.SMTP_PORT || process.env.MORO_SMTP_PORT || '587'),
    //   secure: process.env.SMTP_SECURE === 'true',
    //   username: process.env.SMTP_USERNAME || process.env.MORO_SMTP_USER,
    //   password: process.env.SMTP_PASSWORD || process.env.MORO_SMTP_PASS
    // }`
      : ''
  }
  }`
        : ''
    }
};`;

    await writeFile(join(projectPath, 'moro.config.ts'), configContent);
  }

  private async generateGitignore(projectPath: string): Promise<void> {
    const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/
.next/
out/

# Environment files
.env
.env.local
.env.production
.env.staging

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Editor directories and files
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Database
*.sqlite
*.db

# SSL certificates
*.pem
*.key
*.crt`;

    await writeFile(join(projectPath, '.gitignore'), gitignoreContent);
  }

  private async generateReadme(
    projectPath: string,
    projectName: string,
    config: any
  ): Promise<void> {
    const readmeContent = `# ${projectName}

**MoroJS ${config.template.charAt(0).toUpperCase() + config.template.slice(1)} Project**

A modern, high-performance ${config.template} built with the MoroJS framework, featuring ${config.runtime} runtime and ${config.database !== 'none' ? config.database : 'no'} database integration.

## Features

${config.features
  .map((feature: string) => {
    const featureMap: Record<string, string> = {
      auth: 'Authentication & Authorization',
      cors: 'CORS & Security Headers',
      compression: 'Compression & Performance',
      websocket: 'WebSocket Support',
      docs: 'API Documentation (OpenAPI)',
      'rate-limit': 'Rate Limiting',
      cache: 'Caching Layer',
      'circuit-breaker': 'Circuit Breaker',
      monitoring: 'Monitoring & Metrics',
      testing: 'Testing Setup',
    };
    return `- ${featureMap[feature] || feature}`;
  })
  .join('\n')}

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
\`\`\`

## Endpoints

- **Health Check**: \`GET /health\`
- **Welcome**: \`GET /\`
${config.features.includes('docs') ? `- **API Docs**: \`GET /docs\`` : ''}

## Configuration

This project includes a comprehensive configuration system:

- **\`moro.config.ts\`** - Feature-based configuration with production-ready defaults
- **\`.env\`** - Environment variables for development
- **\`.env.example\`** - Environment variables template

### Production Setup

1. Set up production environment variables:
   \`\`\`bash
   cp .env.example .env.production
   # Edit .env.production with your production values
   \`\`\`

2. The configuration automatically adapts to production when \`NODE_ENV=production\`:
   - **Performance**: Compression, clustering, circuit breakers
   - **Security**: CORS, Helmet, rate limiting, SSL
   - **Monitoring**: Structured logging, file outputs
   - **Scalability**: Redis caching, connection pooling

## Database

${
  config.database !== 'none'
    ? `
This project uses **${config.database}** as the primary database.

\`\`\`bash
# Run migrations
npm run db:migrate

# Seed database
npm run db:seed
\`\`\`
`
    : 'No database configured. Add one with `morojs-cli db setup <type>`.'
}

## Development

\`\`\`bash
# Development with hot reload
npm run dev

# Run tests
npm test

# Lint code
npm run lint
\`\`\`

## Module Development

Create new modules with the MoroJS CLI:

\`\`\`bash
# Create a new module
morojs-cli module create users --features=database,auth,cache

# List all modules
morojs-cli module list
\`\`\`

## Deployment

${
  config.runtime === 'vercel-edge'
    ? `
### Vercel Edge Runtime

\`\`\`bash
npm run deploy:vercel
\`\`\`
`
    : ''
}
${
  config.runtime === 'aws-lambda'
    ? `
### AWS Lambda

\`\`\`bash
npm run deploy:lambda
\`\`\`
`
    : ''
}
${
  config.runtime === 'cloudflare-workers'
    ? `
### Cloudflare Workers

\`\`\`bash
npm run deploy:workers
\`\`\`
`
    : ''
}
${
  config.runtime === 'node'
    ? `
### Traditional Node.js Deployment

Deploy to any Node.js hosting provider:

\`\`\`bash
npm run build
npm start
\`\`\`
`
    : ''
}

## Documentation

- [MoroJS Framework](https://morojs.com)
- [API Documentation](${config.features.includes('docs') ? '/docs' : 'https://morojs.com/docs'})
- [Module Development Guide](https://morojs.com/modules)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit your changes (\`git commit -m 'Add amazing feature'\`)
4. Push to the branch (\`git push origin feature/amazing-feature\`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

---

**Built with ❤️ using [MoroJS Framework](https://morojs.com)**`;

    await writeFile(join(projectPath, 'README.md'), readmeContent);
  }

  private async generateDockerfile(projectPath: string, config: any): Promise<void> {
    if (config.runtime !== 'node') return; // Docker only for Node.js runtime

    const dockerContent = `# MoroJS ${config.template.charAt(0).toUpperCase() + config.template.slice(1)} - Docker Configuration

# Use official Node.js runtime as base image
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 morojs
RUN adduser --system --uid 1001 morojs

# Copy built application
COPY --from=builder --chown=morojs:morojs /app/dist ./dist
COPY --from=builder --chown=morojs:morojs /app/node_modules ./node_modules
COPY --from=builder --chown=morojs:morojs /app/package.json ./package.json

USER morojs

EXPOSE 3000

ENV PORT 3000
ENV HOST 0.0.0.0

CMD ["node", "dist/index.js"]`;

    await writeFile(join(projectPath, 'Dockerfile'), dockerContent);

    // Docker compose for development with database
    if (config.database !== 'none') {
      const composeContent = `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=\${DATABASE_URL}
    depends_on:
      - database
    volumes:
      - .:/app
      - /app/node_modules

${
  config.database === 'postgresql'
    ? `
  database:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-myapp}
      POSTGRES_USER: \${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-password}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:`
    : ''
}
${
  config.database === 'mysql'
    ? `
  database:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: \${MYSQL_PASSWORD:-password}
      MYSQL_DATABASE: \${MYSQL_DATABASE:-myapp}
      MYSQL_USER: \${MYSQL_USER:-mysql}
      MYSQL_PASSWORD: \${MYSQL_PASSWORD:-password}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:`
    : ''
}
${
  config.database === 'mongodb'
    ? `
  database:
    image: mongo:7
    environment:
      MONGO_INITDB_DATABASE: \${MONGO_DATABASE:-myapp}
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:`
    : ''
}
${
  config.database === 'redis'
    ? `
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:`
    : ''
}`;

      await writeFile(join(projectPath, 'docker-compose.yml'), composeContent);
    }
  }

  private async generateProjectStructure(projectPath: string, config: any): Promise<void> {
    // Create directory structure
    const directories = ['src/modules', 'src/middleware', 'src/types', 'src/utils'];

    if (config.database !== 'none') {
      directories.push('src/database', 'src/database/migrations', 'src/database/seeds');
    }

    if (config.features.includes('testing')) {
      directories.push('tests', 'tests/unit', 'tests/integration');
    }

    for (const dir of directories) {
      await mkdir(join(projectPath, dir), { recursive: true });
    }

    // Generate database setup if database is configured
    if (config.database !== 'none') {
      await this.generateDatabaseSetup(projectPath, config);
    }

    // Generate auth middleware if auth is enabled
    if (config.features.includes('auth')) {
      await this.generateAuthMiddleware(projectPath);
    }

    // Generate test setup if testing is enabled
    if (config.features.includes('testing')) {
      await this.generateTestSetup(projectPath);
    }
  }

  private async generateDatabaseSetup(projectPath: string, config: any): Promise<void> {
    // Fix the adapter name for PostgreSQL (should be PostgreSQLAdapter, not PostgresqlAdapter)
    const getAdapterName = (dbType: string) => {
      if (dbType === 'postgresql') return 'PostgreSQLAdapter';
      return dbType.charAt(0).toUpperCase() + dbType.slice(1) + 'Adapter';
    };

    const adapterName = getAdapterName(config.database);

    const dbSetupContent =
      config.database === 'postgresql'
        ? `// Database Setup and Configuration
import pg from 'pg';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    const pool = new pg.Pool({
      host: process.env.POSTGRESQL_HOST || 'localhost',
      port: parseInt(process.env.POSTGRESQL_PORT || '5432'),
      user: process.env.POSTGRESQL_USER || 'postgres',
      password: process.env.POSTGRESQL_PASSWORD || 'postgres',
      database: process.env.POSTGRESQL_DATABASE || 'postgres'
    });

    await pool.connect();
    app.database = pool;

    logger.info('✅ Database connected successfully', 'Database');
  } catch (error) {
    logger.error('❌ Database connection failed: ' + String(error), 'Database');
    logger.warn('⚠️  App will continue without database connection', 'Database');
    // Don't throw - let the app continue without database
  }
}`
        : config.database === 'mysql'
          ? `// Database Setup and Configuration
import mysql from 'mysql2/promise';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    const pool = await mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'mysql',
      password: process.env.MYSQL_PASSWORD || 'mysql',
      database: process.env.MYSQL_DATABASE || 'mysql'
    });

    app.database = pool;
    logger.info('✅ Database connected successfully', 'Database');
  } catch (error) {
    logger.error('❌ Database connection failed: ' + String(error), 'Database');
    logger.warn('⚠️  App will continue without database connection', 'Database');
    // Don't throw - let the app continue without database
  }
}`
          : config.database === 'mongodb'
            ? `// Database Setup and Configuration
import { MongoClient } from 'mongodb';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    app.database = client.db(process.env.MONGODB_DATABASE || 'test');
    logger.info('✅ Database connected successfully', 'Database');
  } catch (error) {
    logger.error('❌ Database connection failed: ' + String(error), 'Database');
    logger.warn('⚠️  App will continue without database connection', 'Database');
    // Don't throw - let the app continue without database
  }
}`
            : '';

    await writeFile(join(projectPath, 'src', 'database', 'index.ts'), dbSetupContent);
  }

  private async generateAuthMiddleware(projectPath: string): Promise<void> {
    const authContent = `// Authentication Middleware for MoroJS
import bcrypt from 'bcryptjs';

// Mock auth middleware that creates the auth object on requests
function createAuthMiddleware() {
  return (req: any, res: any, next: any) => {
    // Initialize auth object
    req.auth = {
      isAuthenticated: false,
      user: null,
      session: null,
      async getSession() {
        return req.auth.session;
      },
      async getUser() {
        return req.auth.user;
      },
      async signIn(provider: string, credentials: any) {
        console.log(\`🔐 Sign in attempt with \${provider}:\`, { email: credentials.email });

        // Mock authentication logic
        if (provider === 'credentials') {
          if (credentials.email === 'admin@example.com' && credentials.password === 'password') {
            const user = {
              id: '1',
              name: 'Admin User',
              email: 'admin@example.com',
              role: 'admin'
            };

            req.auth.isAuthenticated = true;
            req.auth.user = user;
            req.auth.session = {
              user,
              expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours
              customData: {
                lastActivity: new Date(),
                sessionId: 'session_' + Math.random().toString(36).substr(2, 9),
                provider: 'credentials',
              },
            };

            console.log('🔐 Authentication successful');
            return user;
          }
        }

        console.log('🔐 Authentication failed');
        return null;
      },
      signOut(options?: any) {
        console.log('🚪 Sign out initiated');
        req.auth.isAuthenticated = false;
        req.auth.user = null;
        req.auth.session = null;
        return { url: options?.callbackUrl || '/' };
      },
      createToken(user: any) {
        // Mock token creation
        return 'jwt_' + Math.random().toString(36).substr(2, 20);
      },
      setSession(sessionData: any) {
        req.auth.session = sessionData.session || sessionData;
        req.auth.user = sessionData.user;
        req.auth.isAuthenticated = true;
        return Promise.resolve();
      }
    };

    // Check for existing authentication via Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      // Mock token validation
      if (token.startsWith('jwt_') || token === 'admin-token') {
        req.auth.isAuthenticated = true;
        req.auth.user = {
          id: '1',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin'
        };
        req.auth.session = {
          user: req.auth.user,
          expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
          customData: {
            lastActivity: new Date(),
            sessionId: 'session_from_token',
            provider: 'credentials',
          },
        };
      }
    }

    next();
  };
}

export async function setupAuth(app: any): Promise<void> {
  // Install the auth middleware
  app.use(createAuthMiddleware());

  // Protected route example
  app.get('/api/profile', async (req: any, res: any) => {
    // Auth.js automatically adds auth object to request
    if (!req.auth?.isAuthenticated) {
    res.status(401);
      return { success: false, error: 'Authentication required' };
    }

    return {
      success: true,
      user: req.auth.user,
      session: req.auth.session
    };
  });

  // Admin-only route example
  app.get('/api/admin', async (req: any, res: any) => {
    if (!req.auth?.isAuthenticated) {
      res.status(401);
      return { success: false, error: 'Authentication required' };
    }

    if (req.auth.user?.role !== 'admin') {
      res.status(403);
      return { success: false, error: 'Admin access required' };
    }

    return {
      success: true,
      message: 'Admin access granted',
      user: req.auth.user
    };
  });
}`;

    await writeFile(join(projectPath, 'src', 'middleware', 'auth.ts'), authContent);
  }

  private async generateTestSetup(projectPath: string): Promise<void> {
    // Jest configuration
    const jestConfig = {
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src', '<rootDir>/tests'],
      testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts',
      ],
      coverageDirectory: 'coverage',
      coverageReporters: ['text', 'lcov', 'html'],
    };

    await writeFile(
      join(projectPath, 'jest.config.js'),
      `module.exports = ${JSON.stringify(jestConfig, null, 2)};`
    );

    // Sample test file
    const testContent = `// Sample Integration Test
import request from 'supertest';
import { app } from '../src/index';

describe('API Health Checks', () => {
  test('GET /health should return healthy status', async () => {
    const response = await request(app.core.getHttpServer().getServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      status: 'healthy'
    });
  });

  test('GET / should return welcome message', async () => {
    const response = await request(app.core.getHttpServer().getServer())
      .get('/')
      .expect(200);

    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('Welcome');
  });
});`;

    await writeFile(join(projectPath, 'tests', 'app.test.ts'), testContent);
  }

  private displaySuccessMessage(projectName: string, config: any): void {
    console.log(
      boxen(
        chalk.green(`
Project "${projectName}" created successfully!

Project Structure:
   ${projectName}/
   ├── src/
   │   ├── index.ts          # Main application
   │   ├── modules/          # MoroJS modules
   │   ├── middleware/       # Custom middleware
   ${config.database !== 'none' ? '│   ├── database/         # Database setup' : ''}
   │   └── types/            # TypeScript types
   ├── package.json
   ├── tsconfig.json
   ├── moro.config.ts
   └── README.md

Next Steps:
   cd ${projectName}
   ${config.skipInstall ? 'npm install' : ''}
   npm run dev

Resources:
   • Documentation: https://morojs.com
   • Examples: morojs-cli examples
   • Create modules: morojs-cli module create <name>

Features Enabled:
${config.features.map((f: string) => `   • ${f}`).join('\n')}
`),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    );
  }

  /**
   * Fetch the latest version of a package from NPM registry
   */
  private async getLatestPackageVersion(packageName: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`npm view ${packageName} version`);
      const version = stdout.trim();
      return `^${version}`;
    } catch (error) {
      this.logger.warn(`Failed to fetch latest version for ${packageName}, using fallback`, 'Init');
      // Fallback to a reasonable default if npm view fails
      if (packageName === '@morojs/moro') {
        return '^1.1.0';
      }
      return '^1.1.0';
    }
  }
}
