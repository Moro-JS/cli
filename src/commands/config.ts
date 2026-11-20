// Configuration Management - Generate and validate MoroJS configurations
import { writeFile, rm } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createFrameworkLogger } from '../logger';

export interface ConfigOptions {
  environment?: 'development' | 'staging' | 'production';
  database?: string;
  runtime?: string;
}

// Runtimes whose platform owns the server (no listen socket, no worker cluster).
const SERVERLESS_RUNTIMES = ['vercel-edge', 'aws-lambda', 'cloudflare-workers'];

// First @morojs/moro release whose configuration has server.timeouts. Earlier
// releases only know the single server.timeout.
const SERVER_TIMEOUTS_SINCE: [number, number, number] = [1, 8, 0];

/**
 * True when the @morojs/moro of the project in `cwd` reads `server.timeouts`.
 *
 * The installed copy decides. When the package is not installed, the lowest
 * version the project's package.json asks for does. A project that names no
 * version (no dependency, "latest", a tag) is taken to be on a current release.
 */
export function frameworkHasServerTimeouts(cwd: string = process.cwd()): boolean {
  const readJson = (file: string): any => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return undefined;
    }
  };

  const installed = readJson(join(cwd, 'node_modules', '@morojs', 'moro', 'package.json'));
  const pkg = readJson(join(cwd, 'package.json'));
  const declared =
    pkg?.dependencies?.['@morojs/moro'] ??
    pkg?.devDependencies?.['@morojs/moro'] ??
    pkg?.peerDependencies?.['@morojs/moro'];

  const source = typeof installed?.version === 'string' ? installed.version : declared;
  const match = typeof source === 'string' ? source.match(/(\d+)\.(\d+)\.(\d+)/) : null;
  if (!match) return true;

  const version = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let i = 0; i < 3; i++) {
    if (version[i] !== SERVER_TIMEOUTS_SINCE[i]) return version[i] > SERVER_TIMEOUTS_SINCE[i];
  }
  return true;
}

/**
 * False when the @morojs/moro installed in `cwd` has no `server.trustProxy`
 * setting (its configuration typings do not name it). True for one that has
 * it, and when the package is not installed.
 */
export function frameworkHasTrustProxy(cwd: string = process.cwd()): boolean {
  const typings = join(cwd, 'node_modules', '@morojs', 'moro', 'dist', 'types', 'config.d.ts');
  try {
    return readFileSync(typings, 'utf8').includes('trustProxy');
  } catch {
    return true;
  }
}

export class ConfigManager {
  private logger = createFrameworkLogger('ConfigManager');

  async initializeConfig(options: ConfigOptions): Promise<void> {
    this.logger.info('Generating MoroJS configuration...', 'Config');

    try {
      const configContent = this.generateConfigContent(options);
      await writeFile(join(process.cwd(), 'moro.config.ts'), configContent);

      this.logger.info('✅ Created moro.config.ts', 'Config');
      this.logger.info('Customize the configuration to match your needs', 'Config');
    } catch (error) {
      this.logger.error('Failed to generate configuration', 'Config');
      throw error;
    }
  }

  async validateConfig(): Promise<void> {
    const configPath = join(process.cwd(), 'moro.config.ts');

    if (!existsSync(configPath)) {
      this.logger.error(
        '❌ No moro.config.ts found. Run "morojs-cli config init" first.',
        'Config'
      );
      return;
    }

    this.logger.info('Validating configuration...', 'Config');

    try {
      const config = await this.loadConfigModule(configPath);

      // Basic validation
      const issues = this.validateConfigStructure(config.default || config);

      if (issues.length === 0) {
        this.logger.info('✅ Configuration validation passed', 'Config');
      } else {
        this.logger.warn('⚠️  Configuration issues found:', 'Config');
        issues.forEach(issue => this.logger.warn(`   • ${issue}`, 'Config'));
      }
    } catch (error) {
      this.logger.error(
        `❌ Invalid configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Config'
      );
    }
  }

  /**
   * Loads moro.config.ts on any supported Node version.
   *
   * Node cannot import TypeScript before 22.18, and newer versions only strip
   * types (a relative import written with a .js extension still points at a
   * .ts file). The file is therefore bundled to plain JavaScript first, with
   * packages left external, and that bundle is loaded.
   */
  private async loadConfigModule(configPath: string): Promise<any> {
    const { build } = await import('esbuild');
    const bundled = join(process.cwd(), `.moro-config-${process.pid}-${Date.now()}.cjs`);

    try {
      await build({
        absWorkingDir: process.cwd(),
        entryPoints: [configPath],
        outfile: bundled,
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'cjs',
        logLevel: 'silent',
      });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(bundled);
    } finally {
      await rm(bundled, { force: true });
    }
  }

  async generateEnvTemplate(options: { environment: string }): Promise<void> {
    this.logger.info('Generating .env template...', 'Config');

    try {
      const envContent = this.generateEnvContent(options.environment);
      await writeFile(join(process.cwd(), '.env.example'), envContent);

      this.logger.info('✅ Created .env.example', 'Config');
      this.logger.info('Copy to .env and fill in your values', 'Config');
    } catch (error) {
      this.logger.error('Failed to generate .env template', 'Config');
      throw error;
    }
  }

  private generateConfigContent(options: ConfigOptions): string {
    // Connection limits, socket timeouts and clustering only exist where the app
    // owns a long-running server. The serverless and edge runtimes are driven by
    // the platform, so --runtime leaves those settings out for them.
    const isServerless = SERVERLESS_RUNTIMES.includes(options.runtime || '');

    // The request timeout, in the form the project's framework version reads.
    const requestTimeout = frameworkHasServerTimeouts()
      ? `timeouts: {
      request: 30000
    },`
      : 'timeout: 30000,';

    // Offered as a commented line where the project's framework has the setting.
    const trustProxy = frameworkHasTrustProxy()
      ? `
    // Behind a load balancer or reverse proxy, set this: req.ip, rate limits, secure cookies and auth then see the real client and scheme. Leave it unset when the app is reached directly.
    // trustProxy: 1,`
      : '';

    return `// MoroJS Configuration
// Auto-generated by MoroJS CLI${
      options.runtime
        ? `
// Runtime: ${options.runtime}`
        : ''
    }

import type { AppConfig } from '@morojs/moro';

export default {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || 'localhost',${trustProxy}${
      isServerless
        ? ''
        : `
    maxConnections: 1000,
    ${requestTimeout}`
    }
    bodySizeLimit: '10mb',
    requestTracking: {
      enabled: true
    },
    errorBoundary: {
      enabled: true
    }
  },

  serviceDiscovery: {
    enabled: false,
    type: 'memory',
    healthCheckInterval: 30000,
    retryAttempts: 3
  },

  database: {
    ${options.database ? `url: process.env.DATABASE_URL,` : '// url: process.env.DATABASE_URL,'}
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      maxRetries: 3,
      retryDelay: 1000,
      keyPrefix: 'moro:'
    }${
      options.database === 'mysql'
        ? `,
    mysql: {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      database: process.env.MYSQL_DATABASE,
      username: process.env.MYSQL_USERNAME || process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      connectionLimit: 10,
      acquireTimeout: 60000,
      timeout: 60000
    }`
        : ''
    }
  },

  modules: {
    cache: {
      enabled: true,
      defaultTtl: 300,
      maxSize: 1000,
      strategy: 'lru'
    },
    rateLimit: {
      enabled: true,
      defaultRequests: 100,
      defaultWindow: 60000,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },
    validation: {
      enabled: true,
      stripUnknown: true,
      abortEarly: false
    }
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: '${options.environment === 'production' ? 'json' : 'pretty'}',
    enableColors: ${options.environment !== 'production'},
    enableTimestamp: true,
    enableContext: true,
    outputs: {
      console: true,
      file: {
        enabled: ${options.environment === 'production'},
        path: './logs/moro.log',
        maxSize: '10MB',
        maxFiles: 5
      },
      webhook: {
        enabled: false,
        url: process.env.WEBHOOK_LOG_URL,
        headers: {}
      }
    }
  },

  security: {
    cors: {
      enabled: true,
      origin: ${options.environment === 'production' ? 'process.env.CORS_ORIGIN || false' : '"*"'},
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: ${options.environment === 'production'}
    },
    helmet: {
      enabled: true,
      contentSecurityPolicy: true,
      hsts: ${options.environment === 'production'},
      noSniff: true,
      frameguard: true
    },
    rateLimit: {
      global: {
        enabled: ${options.environment === 'production'},
        requests: 1000,
        window: 60000
      }
    }
  },

  external: {
    // Stripe configuration
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      apiVersion: '2023-10-16'
    },

    // SMTP configuration
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      username: process.env.SMTP_USERNAME,
      password: process.env.SMTP_PASSWORD
    }
  },

  performance: {
    compression: {
      enabled: true,
      level: 6,
      threshold: 1024
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 10000
    }${
      isServerless
        ? ''
        : `,
    clustering: {
      enabled: ${options.environment === 'production'},
      workers: parseInt(process.env.CLUSTER_WORKERS || '0') || 'auto'
    }`
    }
  }
} as Partial<AppConfig>;`;
  }

  private generateEnvContent(environment: string): string {
    return `# MoroJS Environment Configuration
# Generated for ${environment} environment

# Server Configuration
NODE_ENV=${environment}
PORT=3000
HOST=localhost
LOG_LEVEL=${environment === 'development' ? 'debug' : 'info'}

# Database Configuration
DATABASE_URL=
REDIS_URL=redis://localhost:6379

# MySQL (if using)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=
MYSQL_USERNAME=
MYSQL_PASSWORD=

# PostgreSQL (if using)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=

# MongoDB (if using)
MONGODB_URI=mongodb://localhost:27017/database_name

# Security
# JWT signing secret. No value is suggested here on purpose: a shared example
# value would end up signing real tokens. Generate one with: openssl rand -hex 32
JWT_SECRET=
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12

# CORS (production only)
${environment === 'production' ? 'CORS_ORIGIN=' : '# CORS_ORIGIN=https://yourdomain.com'}

# External Services
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# SMTP Email
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=
SMTP_PASSWORD=

# Monitoring & Logging
WEBHOOK_LOG_URL=
SENTRY_DSN=
NEW_RELIC_LICENSE_KEY=

# Performance
CLUSTER_WORKERS=0

# Development Tools
${environment === 'development' ? 'DEBUG=moro:*' : '# DEBUG=moro:*'}`;
  }

  private validateConfigStructure(config: any): string[] {
    const issues: string[] = [];

    // Check required sections
    const requiredSections = ['server', 'logging', 'security', 'performance'];
    for (const section of requiredSections) {
      if (!config[section]) {
        issues.push(`Missing required section: ${section}`);
      }
    }

    // Validate server config
    if (config.server) {
      if (!config.server.port || typeof config.server.port !== 'number') {
        issues.push('server.port must be a number');
      }
      if (!config.server.host || typeof config.server.host !== 'string') {
        issues.push('server.host must be a string');
      }
    }

    // Validate logging config
    if (config.logging) {
      const validLevels = ['debug', 'info', 'warn', 'error', 'fatal'];
      if (config.logging.level && !validLevels.includes(config.logging.level)) {
        issues.push(`logging.level must be one of: ${validLevels.join(', ')}`);
      }
    }

    return issues;
  }
}
