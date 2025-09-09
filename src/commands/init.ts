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
          { name: 'Authentication & Authorization', value: 'auth', checked: true },
          { name: ' CORS & Security Headers', value: 'cors', checked: true },
          { name: ' Compression & Performance', value: 'compression', checked: true },
          { name: 'WebSocket Support', value: 'websocket' },
          { name: 'API Documentation (OpenAPI)', value: 'docs', checked: true },
          { name: 'Rate Limiting', value: 'rate-limit', checked: true },
          { name: 'Caching Layer', value: 'cache' },
          { name: 'Circuit Breaker', value: 'circuit-breaker' },
          { name: 'Monitoring & Metrics', value: 'monitoring' },
          { name: 'Testing Setup', value: 'testing', checked: true },
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
      main: 'dist/index.js',
      type: 'module',
      scripts: {
        dev: 'morojs-cli dev',
        build: 'morojs-cli build',
        start: 'node dist/index.js',
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
        '@morojs/moro': '^1.0.0',
        ...(config.database === 'postgresql' && { pg: '^8.11.3', '@types/pg': '^8.10.9' }),
        ...(config.database === 'mysql' && { mysql2: '^3.6.5' }),
        ...(config.database === 'mongodb' && { mongodb: '^6.3.0' }),
        ...(config.database === 'redis' && { redis: '^4.6.10' }),
        ...(config.database === 'drizzle' && {
          'drizzle-orm': '^0.29.1',
          'drizzle-kit': '^0.20.6',
        }),
        ...(config.features.includes('auth') && { jsonwebtoken: '^9.0.2', bcryptjs: '^2.4.3' }),
        zod: '^3.22.4',
      },
      devDependencies: {
        '@morojs/cli': '^1.0.0',
        '@types/node': '^20.10.0',
        typescript: '^5.3.2',
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
        rootDir: './src',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        removeComments: false,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        resolveJsonModule: true,
        allowSyntheticDefaultImports: true,
      },
      include: ['src/**/*'],
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
import { ${runtimeImports[config.runtime as keyof typeof runtimeImports]}, logger } from '@morojs/moro';
${config.database !== 'none' ? `import { setupDatabase } from './database';` : ''}
${config.features.includes('auth') ? `import { setupAuth } from './middleware/auth';` : ''}

// Create MoroJS application with ${config.runtime} runtime
const app = ${runtimeImports[config.runtime as keyof typeof runtimeImports]}({
  runtime: { type: '${config.runtime}' },
  ${config.features.includes('cors') ? `cors: true,` : ''}
  ${config.features.includes('compression') ? `compression: true,` : ''}
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'pretty'
  }
});

// Database setup
${config.database !== 'none' ? `await setupDatabase(app);` : ''}

// Middleware setup
${config.features.includes('auth') ? `await setupAuth(app);` : ''}

// API Documentation
${
  config.features.includes('docs')
    ? `
app.enableDocs({
  title: '${config.template.charAt(0).toUpperCase() + config.template.slice(1)} API',
  description: 'MoroJS ${config.template} application',
  version: '1.0.0',
  basePath: '/docs'
});`
    : ''
}

// Health check endpoint
app.get('/health', async (req, res) => {
  return {
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    runtime: '${config.runtime}',
    version: '1.0.0'
  };
});

// Welcome endpoint
app.get('/', async (req, res) => {
  return {
    message: 'Welcome to your MoroJS ${config.template}!',
    docs: '/docs',
    health: '/health'
  };
});

// Auto-discover and load modules
// Modules will be automatically loaded from ./modules directory

${
  config.runtime === 'node'
    ? `
// Start server (Node.js only)
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, HOST, () => {
  logger.info(\`\${config.template.charAt(0).toUpperCase() + config.template.slice(1)} server running!\`);
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
import { z } from 'zod';

export default {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },
  
  ${
    config.database !== 'none'
      ? `database: {
    ${config.database === 'postgresql' ? `url: process.env.DATABASE_URL` : ''}
    ${config.database === 'mysql' ? `url: process.env.DATABASE_URL` : ''}
    ${config.database === 'mongodb' ? `url: process.env.MONGODB_URI` : ''}
    ${config.database === 'redis' ? `redis: { url: process.env.REDIS_URL }` : ''}
  },`
      : ''
  }
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'pretty',
    enableColors: true,
    enableTimestamp: true
  },
  
  security: {
    cors: {
      enabled: true,
      origin: process.env.NODE_ENV === 'production' ? false : '*'
    },
    helmet: {
      enabled: true
    }
  },
  
  performance: {
    compression: {
      enabled: true,
      level: 6
    },
    circuitBreaker: {
      enabled: ${config.features.includes('circuit-breaker')}
    }
  },
  
  modules: {
    cache: {
      enabled: ${config.features.includes('cache')},
      defaultTtl: 300
    },
    rateLimit: {
      enabled: ${config.features.includes('rate-limit')},
      defaultRequests: 100,
      defaultWindow: 60000
    }
  }
};`;

    await writeFile(join(projectPath, 'moro.config.js'), configContent);
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
    const dbSetupContent = `// Database Setup and Configuration
import { ${config.database.charAt(0).toUpperCase() + config.database.slice(1)}Adapter } from '@morojs/moro';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    const adapter = new ${config.database.charAt(0).toUpperCase() + config.database.slice(1)}Adapter({
      ${
        config.database === 'postgresql' || config.database === 'mysql'
          ? `
      url: process.env.DATABASE_URL,
      host: process.env.${config.database.toUpperCase()}_HOST,
      port: parseInt(process.env.${config.database.toUpperCase()}_PORT || '${config.database === 'postgresql' ? '5432' : '3306'}'),
      username: process.env.${config.database.toUpperCase()}_USER,
      password: process.env.${config.database.toUpperCase()}_PASSWORD,
      database: process.env.${config.database.toUpperCase()}_${config.database === 'postgresql' ? 'DB' : 'DATABASE'}`
          : ''
      }
      ${
        config.database === 'mongodb'
          ? `
      url: process.env.MONGODB_URI`
          : ''
      }
      ${
        config.database === 'redis'
          ? `
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379')`
          : ''
      }
    });

    await adapter.connect();
    app.database(adapter);
    
    logger.info('✅ Database connected successfully', 'Database');
  } catch (error) {
    logger.error('❌ Database connection failed:', error, 'Database');
    throw error;
  }
}`;

    await writeFile(join(projectPath, 'src', 'database', 'index.ts'), dbSetupContent);
  }

  private async generateAuthMiddleware(projectPath: string): Promise<void> {
    const authContent = `// Authentication Middleware
import { auth } from '@morojs/moro';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function setupAuth(app: any): Promise<void> {
  // JWT Authentication middleware
  app.use(auth({
    secret: JWT_SECRET,
    algorithms: ['HS256'],
    optional: true // Make auth optional by default
  }));

  // Login endpoint
  app.post('/auth/login', async (req: any, res: any) => {
    const { email, password } = req.body;
    
    // TODO: Implement user lookup from database
    // const user = await getUserByEmail(email);
    // const isValid = await bcrypt.compare(password, user.password);
    
    // Mock implementation
    if (email === 'admin@example.com' && password === 'password') {
      const token = jwt.sign(
        { userId: 1, email, roles: ['admin'] },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );
      
      return { success: true, token, user: { id: 1, email, roles: ['admin'] } };
    }
    
    res.status(401);
    return { success: false, error: 'Invalid credentials' };
  });

  // Protected route example
  app.get('/auth/profile', async (req: any, res: any) => {
    if (!req.user) {
      res.status(401);
      return { success: false, error: 'Authentication required' };
    }
    
    return { success: true, user: req.user };
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
   ├── moro.config.js
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
}
