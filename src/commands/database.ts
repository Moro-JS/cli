// Database Management - Setup adapters, run migrations and seeds
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createFrameworkLogger } from '../logger';

export interface DatabaseSetupOptions {
  host?: string;
  port?: string;
  username?: string;
  database?: string;
  withMigrations?: boolean;
  withSeeds?: boolean;
}

export interface MigrationOptions {
  up?: boolean;
  down?: boolean;
  reset?: boolean;
}

export interface SeedOptions {
  environment?: string;
}

export class DatabaseManager {
  private logger = createFrameworkLogger('DatabaseManager');

  async setupAdapter(type: string, options: DatabaseSetupOptions): Promise<void> {
    this.logger.info(`Setting up ${type} database adapter...`, 'Database');

    try {
      // Create database directory structure
      await this.createDatabaseStructure();

      // Generate adapter configuration
      await this.generateAdapterConfig(type, options);

      // Generate migration system if requested
      if (options.withMigrations) {
        await this.generateMigrationSystem(type);
      }

      // Generate seed system if requested
      if (options.withSeeds) {
        await this.generateSeedSystem(type);
      }

      this.logger.info('✅ Database adapter setup complete!', 'Database');
      this.logger.info('Next steps:', 'Database');
      this.logger.info('  1. Update your .env file with database credentials', 'Database');
      this.logger.info('  2. Run migrations: morojs-cli db migrate --up', 'Database');
      this.logger.info('  3. Seed data: morojs-cli db seed', 'Database');
    } catch (error) {
      this.logger.error(
        `Failed to setup database adapter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Database'
      );
      throw error;
    }
  }

  async runMigrations(options: MigrationOptions): Promise<void> {
    const migrationsDir = join(process.cwd(), 'src', 'database', 'migrations');

    if (!existsSync(migrationsDir)) {
      this.logger.error(
        '❌ No migrations directory found. Run "morojs-cli db setup <type> --with-migrations" first.',
        'Database'
      );
      return;
    }

    try {
      if (options.reset) {
        this.logger.info('Resetting all migrations...', 'Database');
        await this.resetMigrations();
      } else if (options.down) {
        this.logger.info(' Running migrations down...', 'Database');
        await this.runMigrationsDown();
      } else {
        this.logger.info(' Running migrations up...', 'Database');
        await this.runMigrationsUp();
      }

      this.logger.info('✅ Migrations completed successfully!', 'Database');
    } catch (error) {
      this.logger.error(
        `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Database'
      );
      throw error;
    }
  }

  async runSeeds(options: SeedOptions): Promise<void> {
    const seedsDir = join(process.cwd(), 'src', 'database', 'seeds');

    if (!existsSync(seedsDir)) {
      this.logger.error(
        '❌ No seeds directory found. Run "morojs-cli db setup <type> --with-seeds" first.',
        'Database'
      );
      return;
    }

    try {
      this.logger.info(
        `Running seeds for ${options.environment || 'development'} environment...`,
        'Database'
      );
      await this.executeSeedFiles(options.environment || 'development');
      this.logger.info('✅ Database seeded successfully!', 'Database');
    } catch (error) {
      this.logger.error(
        `Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Database'
      );
      throw error;
    }
  }

  private async createDatabaseStructure(): Promise<void> {
    const directories = [
      'src/database',
      'src/database/adapters',
      'src/database/migrations',
      'src/database/seeds',
    ];

    for (const dir of directories) {
      await mkdir(join(process.cwd(), dir), { recursive: true });
    }
  }

  private async generateAdapterConfig(type: string, options: DatabaseSetupOptions): Promise<void> {
    const adapterConfigs = {
      postgresql: this.generatePostgreSQLConfig(options),
      mysql: this.generateMySQLConfig(options),
      sqlite: this.generateSQLiteConfig(options),
      mongodb: this.generateMongoDBConfig(options),
      redis: this.generateRedisConfig(options),
      drizzle: this.generateDrizzleConfig(options),
    };

    const config = adapterConfigs[type as keyof typeof adapterConfigs];
    if (!config) {
      throw new Error(`Unsupported database type: ${type}`);
    }

    await writeFile(join(process.cwd(), 'src', 'database', 'index.ts'), config.setup);

    // Generate adapter-specific files
    if ('adapter' in config && config.adapter) {
      await writeFile(
        join(process.cwd(), 'src', 'database', 'adapters', `${type}.ts`),
        config.adapter
      );
    }

    // Update .env template
    if ('env' in config && config.env) {
      await this.updateEnvTemplate(config.env);
    }
  }

  private generatePostgreSQLConfig(options: DatabaseSetupOptions) {
    return {
      setup: `// PostgreSQL Database Setup
import { PostgreSQLAdapter } from '@morojs/moro';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('PostgreSQL');

export async function setupDatabase(app: any): Promise<PostgreSQLAdapter> {
  const adapter = new PostgreSQLAdapter({
    host: process.env.POSTGRES_HOST || '${options.host || 'localhost'}',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    username: process.env.POSTGRES_USER || '${options.username || 'postgres'}',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || '${options.database || 'myapp'}',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000
  });

  try {
    await adapter.connect();
    app.database(adapter);
    logger.info('✅ PostgreSQL connected successfully', 'Database');
    return adapter;
  } catch (error) {
    logger.error('❌ PostgreSQL connection failed:', error, 'Database');
    throw error;
  }
}`,
      env: `
# PostgreSQL Configuration
POSTGRES_HOST=${options.host || 'localhost'}
POSTGRES_PORT=5432
POSTGRES_USER=${options.username || 'postgres'}
POSTGRES_PASSWORD=
POSTGRES_DB=${options.database || 'myapp'}
DATABASE_URL=postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}`,
    };
  }

  private generateMySQLConfig(options: DatabaseSetupOptions) {
    return {
      setup: `// MySQL Database Setup
import { MySQLAdapter } from '@morojs/moro';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('MySQL');

export async function setupDatabase(app: any): Promise<MySQLAdapter> {
  const adapter = new MySQLAdapter({
    host: process.env.MYSQL_HOST || '${options.host || 'localhost'}',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || '${options.username || 'root'}',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || '${options.database || 'myapp'}',
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
  });

  try {
    await adapter.connect();
    app.database(adapter);
    logger.info('✅ MySQL connected successfully', 'Database');
    return adapter;
  } catch (error) {
    logger.error('❌ MySQL connection failed:', error, 'Database');
    throw error;
  }
}`,
      env: `
# MySQL Configuration
MYSQL_HOST=${options.host || 'localhost'}
MYSQL_PORT=3306
MYSQL_USER=${options.username || 'root'}
MYSQL_PASSWORD=
MYSQL_DATABASE=${options.database || 'myapp'}
DATABASE_URL=mysql://\${MYSQL_USER}:\${MYSQL_PASSWORD}@\${MYSQL_HOST}:\${MYSQL_PORT}/\${MYSQL_DATABASE}`,
    };
  }

  private generateSQLiteConfig(options: DatabaseSetupOptions) {
    return {
      setup: `// SQLite Database Setup
import { SQLiteAdapter } from '@morojs/moro';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('SQLite');

export async function setupDatabase(app: any): Promise<SQLiteAdapter> {
  const adapter = new SQLiteAdapter({
    filename: process.env.SQLITE_DATABASE || '${options.database || './data/app.db'}',
    verbose: process.env.NODE_ENV === 'development'
  });

  try {
    await adapter.connect();
    app.database(adapter);
    logger.info('✅ SQLite connected successfully', 'Database');
    return adapter;
  } catch (error) {
    logger.error('❌ SQLite connection failed:', error, 'Database');
    throw error;
  }
}`,
      env: `
# SQLite Configuration
SQLITE_DATABASE=./data/app.db
DATABASE_URL=sqlite://\${SQLITE_DATABASE}`,
    };
  }

  private generateMongoDBConfig(options: DatabaseSetupOptions) {
    return {
      setup: `// MongoDB Database Setup
import { MongoDBAdapter } from '@morojs/moro';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('MongoDB');

export async function setupDatabase(app: any): Promise<MongoDBAdapter> {
  const adapter = new MongoDBAdapter({
    url: process.env.MONGODB_URI || 'mongodb://${options.host || 'localhost'}:27017/${options.database || 'myapp'}',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    }
  });

  try {
    await adapter.connect();
    app.database(adapter);
    logger.info('✅ MongoDB connected successfully', 'Database');
    return adapter;
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error, 'Database');
    throw error;
  }
}`,
      env: `
# MongoDB Configuration
MONGODB_URI=mongodb://${options.host || 'localhost'}:27017/${options.database || 'myapp'}
DATABASE_URL=\${MONGODB_URI}`,
    };
  }

  private generateRedisConfig(options: DatabaseSetupOptions) {
    return {
      setup: `// Redis Database Setup
import { RedisAdapter } from '@morojs/moro';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Redis');

export async function setupDatabase(app: any): Promise<RedisAdapter> {
  const adapter = new RedisAdapter({
    host: process.env.REDIS_HOST || '${options.host || 'localhost'}',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'moro:',
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  });

  try {
    await adapter.connect();
    app.database(adapter);
    logger.info('✅ Redis connected successfully', 'Database');
    return adapter;
  } catch (error) {
    logger.error('❌ Redis connection failed:', error, 'Database');
    throw error;
  }
}`,
      env: `
# Redis Configuration
REDIS_HOST=${options.host || 'localhost'}
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=moro:
REDIS_URL=redis://\${REDIS_HOST}:\${REDIS_PORT}/\${REDIS_DB}
DATABASE_URL=\${REDIS_URL}`,
    };
  }

  private generateDrizzleConfig(_options: DatabaseSetupOptions) {
    return {
      setup: `// Drizzle ORM Setup
import { DrizzleAdapter } from '@morojs/moro';
import { createFrameworkLogger } from '@morojs/moro';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';

const logger = createFrameworkLogger('Drizzle');

export async function setupDatabase(app: any): Promise<DrizzleAdapter> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  await client.connect();
  const db = drizzle(client);

  const adapter = new DrizzleAdapter({
    db,
    client
  });

  try {
    app.database(adapter);
    logger.info('✅ Drizzle ORM connected successfully', 'Database');
    return adapter;
  } catch (error) {
    logger.error('❌ Drizzle ORM connection failed:', error, 'Database');
    throw error;
  }
}`,
      adapter: `// Drizzle Schema Example
import { pgTable, serial, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;`,
      env: `
# Drizzle ORM Configuration (PostgreSQL)
DATABASE_URL=postgresql://username:password@localhost:5432/database_name`,
    };
  }

  private async generateMigrationSystem(_type: string): Promise<void> {
    // Generate migration runner
    const migrationRunner = `// Database Migration Runner
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Migrations');

export class MigrationRunner {
  constructor(private adapter: any) {}

  async runUp(): Promise<void> {
    const migrations = await this.getMigrations();
    
    for (const migration of migrations) {
      logger.info(\`Running migration: \${migration.name}\`, 'Migration');
      await this.executeMigration(migration.up);
      logger.info(\`✅ Migration completed: \${migration.name}\`, 'Migration');
    }
  }

  async runDown(): Promise<void> {
    const migrations = await this.getMigrations();
    
    for (const migration of migrations.reverse()) {
      logger.info(\`Reversing migration: \${migration.name}\`, 'Migration');
      await this.executeMigration(migration.down);
      logger.info(\`✅ Migration reversed: \${migration.name}\`, 'Migration');
    }
  }

  private async getMigrations() {
    const migrationsDir = join(process.cwd(), 'src', 'database', 'migrations');
    const files = await readdir(migrationsDir);
    
    return files
      .filter(file => file.endsWith('.sql'))
      .sort()
      .map(async file => {
        const content = await readFile(join(migrationsDir, file), 'utf-8');
        const [up, down] = content.split('-- DOWN');
        
        return {
          name: file,
          up: up.replace('-- UP', '').trim(),
          down: down ? down.trim() : ''
        };
      });
  }

  private async executeMigration(sql: string): Promise<void> {
    if (!sql) return;
    await this.adapter.query(sql);
  }
}`;

    await writeFile(join(process.cwd(), 'src', 'database', 'migration-runner.ts'), migrationRunner);

    // Generate sample migration
    const sampleMigration = `-- UP
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- DOWN
DROP TABLE IF EXISTS users;`;

    await writeFile(
      join(process.cwd(), 'src', 'database', 'migrations', '001_create_users_table.sql'),
      sampleMigration
    );
  }

  private async generateSeedSystem(_type: string): Promise<void> {
    // Generate seed runner
    const seedRunner = `// Database Seed Runner
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { createFrameworkLogger } from '@morojs/moro';

const logger = createFrameworkLogger('Seeds');

export class SeedRunner {
  constructor(private adapter: any) {}

  async run(environment: string = 'development'): Promise<void> {
    const seeds = await this.getSeeds(environment);
    
    for (const seed of seeds) {
      logger.info(\`Running seed: \${seed.name}\`, 'Seed');
      await this.executeSeed(seed.sql);
      logger.info(\`✅ Seed completed: \${seed.name}\`, 'Seed');
    }
  }

  private async getSeeds(environment: string) {
    const seedsDir = join(process.cwd(), 'src', 'database', 'seeds');
    const files = await readdir(seedsDir);
    
    return files
      .filter(file => file.endsWith('.sql') && file.includes(environment))
      .sort()
      .map(async file => {
        const content = await readFile(join(seedsDir, file), 'utf-8');
        return {
          name: file,
          sql: content
        };
      });
  }

  private async executeSeed(sql: string): Promise<void> {
    if (!sql) return;
    await this.adapter.query(sql);
  }
}`;

    await writeFile(join(process.cwd(), 'src', 'database', 'seed-runner.ts'), seedRunner);

    // Generate sample seeds
    const developmentSeed = `-- Development Seed Data
INSERT INTO users (name, email, password_hash) VALUES
('Admin User', 'admin@example.com', '$2b$12$example_hash_here'),
('John Doe', 'john@example.com', '$2b$12$example_hash_here'),
('Jane Smith', 'jane@example.com', '$2b$12$example_hash_here');`;

    const productionSeed = `-- Production Seed Data
INSERT INTO users (name, email, password_hash) VALUES
('System Admin', 'admin@yourdomain.com', '$2b$12$your_actual_hash_here');`;

    await writeFile(
      join(process.cwd(), 'src', 'database', 'seeds', 'development.sql'),
      developmentSeed
    );

    await writeFile(
      join(process.cwd(), 'src', 'database', 'seeds', 'production.sql'),
      productionSeed
    );
  }

  private async updateEnvTemplate(envContent: string): Promise<void> {
    const envPath = join(process.cwd(), '.env.example');

    try {
      let existingContent = '';
      if (existsSync(envPath)) {
        existingContent = await readFile(envPath, 'utf-8');
      }

      const updatedContent = existingContent + '\n' + envContent;
      await writeFile(envPath, updatedContent);
    } catch (error) {
      // If we can't update, just log a warning
      this.logger.warn('Could not update .env.example file', 'Database');
    }
  }

  private async runMigrationsUp(): Promise<void> {
    // Implementation would depend on the database type
    // For now, just log the action
    this.logger.info('Migration system would run here', 'Database');
    this.logger.info('Implement actual migration logic based on your database adapter', 'Database');
  }

  private async runMigrationsDown(): Promise<void> {
    // Implementation would depend on the database type
    this.logger.info('Migration rollback system would run here', 'Database');
    this.logger.info(
      'Implement actual migration rollback logic based on your database adapter',
      'Database'
    );
  }

  private async resetMigrations(): Promise<void> {
    // Implementation would depend on the database type
    this.logger.info('Migration reset system would run here', 'Database');
    this.logger.info(
      'Implement actual migration reset logic based on your database adapter',
      'Database'
    );
  }

  private async executeSeedFiles(environment: string): Promise<void> {
    // Implementation would depend on the database type
    this.logger.info(`Seed execution system would run here for ${environment}`, 'Database');
    this.logger.info(
      'Implement actual seed execution logic based on your database adapter',
      'Database'
    );
  }
}
