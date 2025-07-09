// Middleware Management - Add and configure built-in middleware
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { createFrameworkLogger } from '../logger';

export interface MiddlewareOptions {
  config?: string;
}

export class MiddlewareManager {
  private logger = createFrameworkLogger('MiddlewareManager');

  async addMiddleware(type: string, options: MiddlewareOptions): Promise<void> {
    this.logger.info(`Adding ${type} middleware...`, 'Middleware');

    try {
      const middlewareConfig = this.getMiddlewareConfig(type, options.config);
      await this.generateMiddlewareSetup(type, middlewareConfig);

      this.logger.info(`✅ ${type} middleware added successfully!`, 'Middleware');
      this.logger.info('Import and use in your main app file', 'Middleware');
    } catch (error) {
      this.logger.error(
        `Failed to add middleware: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Middleware'
      );
      throw error;
    }
  }

  async listMiddleware(): Promise<void> {
    const middleware = [
      { name: 'auth', description: 'Authentication & Authorization (JWT, Session, OAuth)' },
      { name: 'cors', description: 'Cross-Origin Resource Sharing' },
      { name: 'rate-limit', description: 'Rate limiting and throttling' },
      { name: 'cache', description: 'Response caching (Memory, Redis, File)' },
      { name: 'validation', description: 'Request validation (Zod-based)' },
      { name: 'helmet', description: 'Security headers' },
      { name: 'compression', description: 'Response compression (gzip, brotli)' },
      { name: 'cookie', description: 'Cookie parsing and management' },
      { name: 'session', description: 'Session management' },
      { name: 'csrf', description: 'CSRF protection' },
      { name: 'csp', description: 'Content Security Policy' },
      { name: 'sse', description: 'Server-Sent Events' },
      { name: 'cdn', description: 'CDN integration (Cloudflare, AWS, Azure)' },
      { name: 'request-logger', description: 'HTTP request logging' },
      { name: 'performance-monitor', description: 'Performance monitoring' },
      { name: 'error-tracker', description: 'Error tracking and reporting' },
    ];

    this.logger.info('Available Built-in Middleware:', 'Middleware');
    middleware.forEach(mw => this.logger.info(`   ${mw.description}`, 'Middleware'));
    this.logger.info('', 'Middleware');
    this.logger.info(
      'Usage: morojs-cli middleware add <type> [--config=\'{"key":"value"}\']',
      'Middleware'
    );
  }

  private getMiddlewareConfig(type: string, configStr?: string): any {
    const defaultConfigs: Record<string, any> = {
      auth: {
        strategy: 'jwt',
        secret: 'process.env.JWT_SECRET',
        expiresIn: '24h',
        algorithms: ['HS256'],
      },
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false,
      },
      'rate-limit': {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests from this IP',
        standardHeaders: true,
        legacyHeaders: false,
      },
      cache: {
        ttl: 300,
        max: 1000,
        strategy: 'lru',
      },
      validation: {
        stripUnknown: true,
        abortEarly: false,
      },
      helmet: {
        contentSecurityPolicy: true,
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: true,
        dnsPrefetchControl: true,
        frameguard: true,
        hidePoweredBy: true,
        hsts: true,
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: false,
        referrerPolicy: true,
        xssFilter: true,
      },
      compression: {
        level: 6,
        threshold: 1024,
        filter: 'shouldCompress',
      },
    };

    let config = defaultConfigs[type] || {};

    if (configStr) {
      try {
        const customConfig = JSON.parse(configStr);
        config = { ...config, ...customConfig };
      } catch (error) {
        this.logger.warn('Invalid JSON config, using defaults', 'Middleware');
      }
    }

    return config;
  }

  private async generateMiddlewareSetup(type: string, config: any): Promise<void> {
    const middlewareSetups: Record<string, (config: any) => string> = {
      auth: cfg => `// Authentication Middleware Setup
import { auth } from '@morojs/moro';

export const authMiddleware = auth({
  strategy: '${cfg.strategy}',
  secret: ${cfg.secret},
  expiresIn: '${cfg.expiresIn}',
  algorithms: ${JSON.stringify(cfg.algorithms)}
});

// Usage in your app:
// app.use(authMiddleware);

// Protected route example:
// app.get('/protected', authMiddleware, (req, res) => {
//   return { user: req.user };
// });`,

      cors: cfg => `// CORS Middleware Setup
import { cors } from '@morojs/moro';

export const corsMiddleware = cors({
  origin: ${typeof cfg.origin === 'string' ? `'${cfg.origin}'` : JSON.stringify(cfg.origin)},
  methods: ${JSON.stringify(cfg.methods)},
  allowedHeaders: ${JSON.stringify(cfg.allowedHeaders)},
  credentials: ${cfg.credentials}
});

// Usage in your app:
// app.use(corsMiddleware);`,

      'rate-limit': cfg => `// Rate Limiting Middleware Setup
import { rateLimit } from '@morojs/moro';

export const rateLimitMiddleware = rateLimit({
  windowMs: ${cfg.windowMs},
  max: ${cfg.max},
  message: '${cfg.message}',
  standardHeaders: ${cfg.standardHeaders},
  legacyHeaders: ${cfg.legacyHeaders}
});

// Usage in your app:
// app.use(rateLimitMiddleware);

// Per-route rate limiting:
// app.get('/api/users', rateLimitMiddleware, handler);`,

      cache: cfg => `// Cache Middleware Setup
import { cache } from '@morojs/moro';

export const cacheMiddleware = cache({
  ttl: ${cfg.ttl},
  max: ${cfg.max},
  strategy: '${cfg.strategy}'
});

// Usage in your app:
// app.use(cacheMiddleware);

// Per-route caching:
// app.get('/api/users', cacheMiddleware, handler);`,

      validation: cfg => `// Validation Middleware Setup
import { validation } from '@morojs/moro';

export const validationMiddleware = validation({
  stripUnknown: ${cfg.stripUnknown},
  abortEarly: ${cfg.abortEarly}
});

// Usage in your app:
// app.use(validationMiddleware);`,

      helmet: cfg => `// Security Headers Middleware Setup
import { helmet } from '@morojs/moro';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: ${cfg.contentSecurityPolicy},
  crossOriginEmbedderPolicy: ${cfg.crossOriginEmbedderPolicy},
  crossOriginOpenerPolicy: ${cfg.crossOriginOpenerPolicy},
  crossOriginResourcePolicy: ${cfg.crossOriginResourcePolicy},
  dnsPrefetchControl: ${cfg.dnsPrefetchControl},
  frameguard: ${cfg.frameguard},
  hidePoweredBy: ${cfg.hidePoweredBy},
  hsts: ${cfg.hsts},
  ieNoOpen: ${cfg.ieNoOpen},
  noSniff: ${cfg.noSniff},
  originAgentCluster: ${cfg.originAgentCluster},
  permittedCrossDomainPolicies: ${cfg.permittedCrossDomainPolicies},
  referrerPolicy: ${cfg.referrerPolicy},
  xssFilter: ${cfg.xssFilter}
});

// Usage in your app:
// app.use(helmetMiddleware);`,

      compression: cfg => `// Compression Middleware Setup
import { compression } from '@morojs/moro';

export const compressionMiddleware = compression({
  level: ${cfg.level},
  threshold: ${cfg.threshold},
  filter: ${cfg.filter}
});

// Usage in your app:
// app.use(compressionMiddleware);`,
    };

    const setupFunction = middlewareSetups[type];
    if (!setupFunction) {
      throw new Error(`Unsupported middleware type: ${type}`);
    }

    const middlewareCode = setupFunction(config);
    const fileName = `${type.replace('-', '_')}_middleware.ts`;

    await writeFile(join(process.cwd(), 'src', 'middleware', fileName), middlewareCode);

    this.logger.info(`Created: src/middleware/${fileName}`, 'Middleware');
  }
}
