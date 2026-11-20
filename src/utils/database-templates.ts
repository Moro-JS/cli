// Database scaffolding templates shared by `init --database` and `db setup`.
//
// One source for both commands keeps the generated `src/database/index.ts`,
// the environment variable names it reads, and the entries written to
// `.env` / `.env.example` in agreement with each other.
//
// Every template talks to the driver package directly. The variable names
// follow what the framework's own configuration reads (DATABASE_URL,
// REDIS_URL, MYSQL_HOST / MYSQL_PORT / MYSQL_DATABASE / MYSQL_USERNAME /
// MYSQL_PASSWORD); PostgreSQL uses the POSTGRES_* names the official image and
// the generated docker-compose.yml use.

export const DATABASE_KINDS = [
  'postgresql',
  'mysql',
  'sqlite',
  'mongodb',
  'redis',
  'drizzle',
] as const;

export type DatabaseKind = (typeof DATABASE_KINDS)[number];

export function isDatabaseKind(value: string): value is DatabaseKind {
  return (DATABASE_KINDS as readonly string[]).includes(value);
}

/** Connection defaults baked into the generated code and env entries. */
export interface DatabaseDefaults {
  host?: string;
  port?: string;
  username?: string;
  password?: string;
  database?: string;
}

const DEFAULT_PORTS: Record<DatabaseKind, string> = {
  postgresql: '5432',
  mysql: '3306',
  sqlite: '',
  mongodb: '27017',
  redis: '6379',
  drizzle: '5432',
};

export const DEFAULT_SQLITE_FILE = './data/app.db';

interface Resolved {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
}

/** Fallback values used inside the generated code when a variable is unset. */
function codeDefaults(kind: DatabaseKind, defaults: DatabaseDefaults): Resolved {
  const builtIn: Record<DatabaseKind, { username: string; password: string; database: string }> = {
    postgresql: { username: 'postgres', password: 'postgres', database: 'postgres' },
    mysql: { username: 'mysql', password: 'mysql', database: 'mysql' },
    sqlite: { username: '', password: '', database: DEFAULT_SQLITE_FILE },
    mongodb: { username: '', password: '', database: '' },
    redis: { username: '', password: '', database: '' },
    drizzle: { username: 'postgres', password: 'postgres', database: 'postgres' },
  };
  return {
    host: defaults.host || 'localhost',
    port: defaults.port || DEFAULT_PORTS[kind],
    username: defaults.username || builtIn[kind].username,
    password: defaults.password ?? builtIn[kind].password,
    database: defaults.database || builtIn[kind].database,
  };
}

/** Placeholder values written to `.env` for the developer to replace. */
function envDefaults(kind: DatabaseKind, defaults: DatabaseDefaults): Resolved {
  return {
    host: defaults.host || 'localhost',
    port: defaults.port || DEFAULT_PORTS[kind],
    username: defaults.username || 'username',
    password: defaults.password ?? 'password',
    database: defaults.database || (kind === 'sqlite' ? DEFAULT_SQLITE_FILE : 'database_name'),
  };
}

// Single-quoted TypeScript string literal for a value that came from a CLI flag.
function lit(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

const FAILURE_HANDLER = `  } catch (error) {
    logger.error('❌ Database connection failed: ' + String(error), 'Database');
    logger.warn('⚠️  App will continue without database connection', 'Database');
    // Don't throw - let the app continue without database
  }`;

/** Source of `src/database/index.ts`: exports `setupDatabase(app)`. */
export function databaseSetupSource(kind: DatabaseKind, defaults: DatabaseDefaults = {}): string {
  const d = codeDefaults(kind, defaults);

  switch (kind) {
    case 'postgresql':
      return `// Database Setup and Configuration
import pg from 'pg';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    const pool = new pg.Pool({
      host: process.env.POSTGRES_HOST || ${lit(d.host)},
      port: parseInt(process.env.POSTGRES_PORT || ${lit(d.port)}),
      user: process.env.POSTGRES_USER || ${lit(d.username)},
      password: process.env.POSTGRES_PASSWORD || ${lit(d.password)},
      database: process.env.POSTGRES_DB || ${lit(d.database)}
    });

    // Check the connection once, then hand the client back to the pool.
    const client = await pool.connect();
    client.release();
    app.database = pool;

    logger.info('✅ Database connected successfully', 'Database');
${FAILURE_HANDLER}
}`;

    case 'mysql':
      return `// Database Setup and Configuration
import mysql from 'mysql2/promise';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    const pool = await mysql.createPool({
      host: process.env.MYSQL_HOST || ${lit(d.host)},
      port: parseInt(process.env.MYSQL_PORT || ${lit(d.port)}),
      // MYSQL_USERNAME is the name the framework configuration reads;
      // MYSQL_USER is accepted for .env files written before it.
      user: process.env.MYSQL_USERNAME || process.env.MYSQL_USER || ${lit(d.username)},
      password: process.env.MYSQL_PASSWORD || ${lit(d.password)},
      database: process.env.MYSQL_DATABASE || ${lit(d.database)}
    });

    // A pool opens connections lazily: take one now so that an unreachable
    // server or wrong credentials are reported here, not on the first query.
    const connection = await pool.getConnection();
    connection.release();

    app.database = pool;
    logger.info('✅ Database connected successfully', 'Database');
${FAILURE_HANDLER}
}`;

    case 'mongodb':
      return `// Database Setup and Configuration
import { MongoClient } from 'mongodb';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    const client = new MongoClient(
      process.env.MONGODB_URI || ${lit(
        `mongodb://${d.host}:${d.port}${d.database ? `/${d.database}` : ''}`
      )},
      {
        // The driver waits 30 seconds for a server by default, which would hold
        // up start-up for that long when MongoDB is unreachable.
        serverSelectionTimeoutMS: 5000
      }
    );
    await client.connect();
    // With MONGODB_DATABASE unset, the database named in MONGODB_URI is used.
    app.database = client.db(process.env.MONGODB_DATABASE || undefined);
    logger.info('✅ Database connected successfully', 'Database');
${FAILURE_HANDLER}
}`;

    case 'sqlite':
      return `// Database Setup and Configuration
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    // Path of the database file. Use ':memory:' for a throwaway in-memory database.
    const filename = process.env.SQLITE_DATABASE || ${lit(d.database)};
    if (filename !== ':memory:') {
      mkdirSync(dirname(filename), { recursive: true });
    }

    const db = new Database(filename);
    db.pragma('foreign_keys = ON');
    app.database = db;

    logger.info('✅ Database connected successfully', 'Database');
${FAILURE_HANDLER}
}`;

    case 'redis':
      return `// Database Setup and Configuration
import { createClient } from 'redis';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    // Until the first connection succeeds, give up after a few attempts so an
    // unreachable Redis server cannot block start-up. Once connected, a dropped
    // connection is retried indefinitely with a short backoff.
    let connected = false;

    const client = createClient({
      url: process.env.REDIS_URL || ${lit(`redis://${d.host}:${d.port}`)},
      socket: {
        reconnectStrategy: (retries: number) =>
          !connected && retries >= 3
            ? new Error('Redis is unreachable')
            : Math.min(retries * 200, 2000)
      }
    });

    client.on('error', (error: Error) => {
      logger.error('Redis error: ' + (error.message || String(error)), 'Database');
    });

    await client.connect();
    connected = true;
    app.database = client;

    logger.info('✅ Database connected successfully', 'Database');
${FAILURE_HANDLER}
}`;

    case 'drizzle':
      return `// Database Setup and Configuration (Drizzle ORM on PostgreSQL)
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Database');

export async function setupDatabase(app: any): Promise<void> {
  try {
    const pool = new pg.Pool({
      connectionString:
        process.env.DATABASE_URL ||
        ${lit(`postgresql://${d.username}:${d.password}@${d.host}:${d.port}/${d.database}`)}
    });

    // Check the connection once so an unreachable database is reported at start-up.
    const client = await pool.connect();
    client.release();

    // Define tables with drizzle-orm/pg-core and query them through app.database.
    app.database = drizzle(pool);

    logger.info('✅ Database connected successfully', 'Database');
${FAILURE_HANDLER}
}`;
  }
}

/**
 * `KEY=value` lines for `.env` (no leading or trailing blank line). The names
 * are exactly the ones `databaseSetupSource()` reads.
 */
export function databaseEnvLines(kind: DatabaseKind, defaults: DatabaseDefaults = {}): string {
  const d = envDefaults(kind, defaults);

  switch (kind) {
    case 'postgresql':
      return [
        `DATABASE_URL=postgresql://${d.username}:${d.password}@${d.host}:${d.port}/${d.database}`,
        `POSTGRES_HOST=${d.host}`,
        `POSTGRES_PORT=${d.port}`,
        `POSTGRES_USER=${d.username}`,
        `POSTGRES_PASSWORD=${d.password}`,
        `POSTGRES_DB=${d.database}`,
      ].join('\n');
    case 'mysql':
      return [
        `DATABASE_URL=mysql://${d.username}:${d.password}@${d.host}:${d.port}/${d.database}`,
        `MYSQL_HOST=${d.host}`,
        `MYSQL_PORT=${d.port}`,
        `MYSQL_USERNAME=${d.username}`,
        `MYSQL_PASSWORD=${d.password}`,
        `MYSQL_DATABASE=${d.database}`,
      ].join('\n');
    case 'mongodb':
      return [
        `DATABASE_URL=mongodb://${d.host}:${d.port}/${d.database}`,
        `MONGODB_URI=mongodb://${d.host}:${d.port}/${d.database}`,
      ].join('\n');
    case 'sqlite':
      return `SQLITE_DATABASE=${d.database}`;
    case 'redis':
      return [
        `REDIS_URL=redis://${d.host}:${d.port}`,
        `REDIS_HOST=${d.host}`,
        `REDIS_PORT=${d.port}`,
      ].join('\n');
    case 'drizzle':
      return `DATABASE_URL=postgresql://${d.username}:${d.password}@${d.host}:${d.port}/${d.database}`;
  }
}

export interface DatabasePackages {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

/** Driver packages the generated `src/database/index.ts` imports. */
export function databasePackages(kind: DatabaseKind): DatabasePackages {
  switch (kind) {
    case 'postgresql':
      return { dependencies: { pg: '^8.16.3', '@types/pg': '^8.15.5' }, devDependencies: {} };
    case 'mysql':
      return { dependencies: { mysql2: '^3.23.1' }, devDependencies: {} };
    case 'mongodb':
      return { dependencies: { mongodb: '^6.20.0' }, devDependencies: {} };
    case 'sqlite':
      return {
        dependencies: { 'better-sqlite3': '^12.4.1' },
        devDependencies: { '@types/better-sqlite3': '^7.6.13' },
      };
    case 'redis':
      return { dependencies: { redis: '^5.8.2' }, devDependencies: {} };
    case 'drizzle':
      return {
        dependencies: {
          'drizzle-orm': '^0.45.2',
          pg: '^8.16.3',
          '@types/pg': '^8.15.5',
        },
        // drizzle-kit is the migration command line: the running app does not load it.
        devDependencies: { 'drizzle-kit': '^0.31.4' },
      };
  }
}
