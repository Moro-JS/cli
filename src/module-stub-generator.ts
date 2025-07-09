// Module Stub Generator for MoroJS
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createFrameworkLogger } from './logger';

export class ModuleStubGenerator {
  private logger = createFrameworkLogger('ModuleStubGenerator');

  async generateAdvancedModule(name: string, options: any): Promise<void> {
    const features = options.features ? options.features.split(',') : [];
    const middleware = options.middleware ? options.middleware.split(',') : [];
    const authRoles = options.authRoles ? options.authRoles.split(',') : [];
    
    this.logger.info(`Generating advanced module: ${name}`, 'ModuleGenerator');
    this.logger.info(`Features: ${features.join(', ') || 'basic'}`, 'ModuleGenerator');
    this.logger.info(`Middleware: ${middleware.join(', ') || 'none'}`, 'ModuleGenerator');
    
    await this.generateModule(name, features, {
      middleware,
      authRoles,
      withTests: options.withTests,
      withDocs: options.withDocs,
      database: options.database,
      template: options.template,
      routes: options.routes
    });
  }

  async listModules(): Promise<void> {
    this.logger.info('Discovering modules in current project...', 'ModuleList');
    
    try {
      const modulesPath = join(process.cwd(), 'src', 'modules');
      if (!existsSync(modulesPath)) {
        this.logger.info('No modules directory found. Create one with: morojs-cli module create <name>', 'ModuleList');
        return;
      }

      const { readdir } = await import('fs/promises');
      const modules = await readdir(modulesPath, { withFileTypes: true });
      const moduleDirectories = modules.filter(dirent => dirent.isDirectory());

      if (moduleDirectories.length === 0) {
        this.logger.info('No modules found. Create one with: morojs-cli module create <name>', 'ModuleList');
        return;
      }

      this.logger.info(`Found ${moduleDirectories.length} module(s):`, 'ModuleList');
      for (const module of moduleDirectories) {
        this.logger.info(`  ${module.name}`, 'ModuleList');
      }
    } catch (error) {
      this.logger.error(`Failed to list modules: ${error instanceof Error ? error.message : 'Unknown error'}`, 'ModuleList');
    }
  }

  async generateModule(name: string, features: string[] = [], advancedOptions: any = {}): Promise<void> {
    const modulePath = join(process.cwd(), name);
    
    // Create module directory
    await mkdir(modulePath, { recursive: true });
    
    // Generate files based on features
    const hasWebSocket = features.includes('websocket');
    const hasDatabase = features.includes('database');
    
    await Promise.all([
      this.writeTypes(modulePath, name),
      this.writeSchemas(modulePath, name),
      this.writeConfig(modulePath, name),
      this.writeActions(modulePath, name, hasDatabase),
      this.writeRoutes(modulePath, name),
      hasWebSocket ? this.writeSockets(modulePath, name) : Promise.resolve(),
      hasDatabase ? this.writeDatabase(modulePath, name) : Promise.resolve()
    ]);
    
    await this.writeIndex(modulePath, name, hasWebSocket);
    
    this.logger.info(`Generated functional module: ${name}`, 'Generation');
    this.logger.info(`Features: ${features.join(', ') || 'basic'}`, 'Instructions');
    this.logger.info(`To get started:`, 'Instructions');
    this.logger.info(`  cd ${name}`, 'Instructions');
    this.logger.info(`  # Add your business logic to actions.ts`, 'Instructions');
    this.logger.info(`  # Configure routes in routes.ts`, 'Instructions');
    this.logger.info(`  # Update validation schemas in schemas.ts`, 'Instructions');
    this.logger.info(`  # Test with: curl http://localhost:3000/api/v1.0.0/${name}/${name}s`, 'Instructions');
  }

  private writeTypes(modulePath: string, name: string) {
    const className = this.capitalize(name);
    const content = `// ${className} Types
export interface ${className} {
  id: number;
  name: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Create${className}Request {
  name: string;
  description: string;
  active?: boolean;
}

export interface Update${className}Request {
  name?: string;
  description?: string;
  active?: boolean;
}`;
    
    return writeFile(join(modulePath, 'types.ts'), content);
  }

  private writeSchemas(modulePath: string, name: string) {
    const className = this.capitalize(name);
    const content = `// ${className} Validation Schemas using Zod
import { z } from 'zod';

// Base schema
export const ${className}Schema = z.object({
  id: z.number(),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// Request schemas
export const Create${className}Schema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500),
  active: z.boolean().default(true)
});

export const Update${className}Schema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  active: z.boolean().optional()
});

// Parameter schemas
export const ${className}ParamsSchema = z.object({
  id: z.coerce.number().min(1)
});

// Query schemas
export const ${className}QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(0).default(0),
  active: z.coerce.boolean().optional(),
  search: z.string().optional()
});

// Export types for TypeScript inference
export type ${className} = z.infer<typeof ${className}Schema>;
export type Create${className}Request = z.infer<typeof Create${className}Schema>;
export type Update${className}Request = z.infer<typeof Update${className}Schema>;
export type ${className}Params = z.infer<typeof ${className}ParamsSchema>;
export type ${className}Query = z.infer<typeof ${className}QuerySchema>;`;
    
    return writeFile(join(modulePath, 'schemas.ts'), content);
  }

  private writeConfig(modulePath: string, name: string) {
    const content = `// ${this.capitalize(name)} Module Configuration
export const config = {
  prefix: '/${name}s',
  version: '1.0.0',
  description: '${this.capitalize(name)} management module',
  tags: ['${name}', 'api']
};`;
    
    return writeFile(join(modulePath, 'config.ts'), content);
  }

  private writeActions(modulePath: string, name: string, hasDatabase: boolean) {
    const className = this.capitalize(name);
    const content = `// ${className} Actions - Pure Business Logic
import { ${className}, Create${className}Request, Update${className}Request } from './types';

// Pure business logic functions that receive dependencies as parameters
export async function getAll${className}s(database: any): Promise<${className}[]> {
  return database.${name}s || [];
}

export async function get${className}ById(id: number, database: any): Promise<${className} | null> {
  const items = database.${name}s || [];
  return items.find((item: ${className}) => item.id === id) || null;
}

export async function create${className}(data: Create${className}Request, database: any, events: any): Promise<${className}> {
  const items = database.${name}s || [];
  const newItem: ${className} = {
    id: Math.max(...items.map((item: ${className}) => item.id), 0) + 1,
    name: data.name,
    description: data.description,
    active: data.active || true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  items.push(newItem);
  
  // Intentional event emission
  await events.emit('${name}.created', { ${name}: newItem });
  
  return newItem;
}

export async function update${className}(id: number, data: Update${className}Request, database: any, events: any): Promise<${className} | null> {
  const items = database.${name}s || [];
  const itemIndex = items.findIndex((item: ${className}) => item.id === id);
  
  if (itemIndex === -1) {
    return null;
  }

  const updates: any = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.active !== undefined) updates.active = data.active;
  
  if (Object.keys(updates).length === 0) {
    return items[itemIndex];
  }
  
  updates.updatedAt = new Date();
  items[itemIndex] = { ...items[itemIndex], ...updates };
  
  // Intentional event emission
  await events.emit('${name}.updated', { ${name}: items[itemIndex], changes: updates });
  
  return items[itemIndex];
}

export async function delete${className}(id: number, database: any, events: any): Promise<boolean> {
  const items = database.${name}s || [];
  const itemIndex = items.findIndex((item: ${className}) => item.id === id);
  
  if (itemIndex === -1) {
    return false;
  }

  const item = items[itemIndex];
  items.splice(itemIndex, 1);
  
  // Intentional event emission
  await events.emit('${name}.deleted', { ${name}Id: id, ${name}: item });
  
  return true;
}`;
    
    return writeFile(join(modulePath, 'actions.ts'), content);
  }

  private writeRoutes(modulePath: string, name: string) {
    const className = this.capitalize(name);
    const content = `// ${className} Routes - HTTP Handlers with Intelligent Routing
import { 
  getAll${className}s, 
  get${className}ById, 
  create${className}, 
  update${className}, 
  delete${className} 
} from './actions';
import {
  ${className}QuerySchema,
  ${className}ParamsSchema,
  Create${className}Schema,
  Update${className}Schema
} from './schemas';

export const routes = [
  {
    method: 'GET' as const,
    path: '/',
    validation: {
      query: ${className}QuerySchema
    },
    cache: { ttl: 60 },
    rateLimit: { requests: 100, window: 60000 },
    description: 'Get all ${name}s with pagination and filtering',
    tags: ['${name}', 'list'],
    handler: async (req: any, res: any) => {
      const items = await getAll${className}s(req.database);
      
      // Apply query filtering
      let filteredItems = items;
      if (req.query.active !== undefined) {
        filteredItems = filteredItems.filter((item: any) => item.active === req.query.active);
      }
      if (req.query.search) {
        filteredItems = filteredItems.filter((item: any) => 
          item.name.toLowerCase().includes(req.query.search.toLowerCase()) ||
          item.description.toLowerCase().includes(req.query.search.toLowerCase())
        );
      }
      
      // Apply pagination
      const offset = req.query.offset || 0;
      const limit = req.query.limit || 10;
      const paginatedItems = filteredItems.slice(offset, offset + limit);
      
      return { 
        success: true, 
        data: paginatedItems,
        meta: {
          total: filteredItems.length,
          offset,
          limit,
          hasMore: offset + limit < filteredItems.length
        }
      };
    }
  },
  {
    method: 'GET' as const,
    path: '/:id',
    validation: {
      params: ${className}ParamsSchema
    },
    cache: { ttl: 300 },
    description: 'Get a ${name} by ID',
    tags: ['${name}', 'get'],
    handler: async (req: any, res: any) => {
      const item = await get${className}ById(req.params.id, req.database);
      
      if (!item) {
        res.status(404);
        return { success: false, error: '${className} not found' };
      }
      
      return { success: true, data: item };
    }
  },
  {
    method: 'POST' as const,
    path: '/',
    validation: {
      body: Create${className}Schema
    },
    rateLimit: { requests: 20, window: 60000 },
    description: 'Create a new ${name}',
    tags: ['${name}', 'create'],
    handler: async (req: any, res: any) => {
      const item = await create${className}(req.body, req.database, req.events);
      res.status(201);
      return { success: true, data: item };
    }
  },
  {
    method: 'PUT' as const,
    path: '/:id',
    validation: {
      params: ${className}ParamsSchema,
      body: Update${className}Schema
    },
    description: 'Update a ${name}',
    tags: ['${name}', 'update'],
    handler: async (req: any, res: any) => {
      const item = await update${className}(req.params.id, req.body, req.database, req.events);
      
      if (!item) {
        res.status(404);
        return { success: false, error: '${className} not found' };
      }
      
      return { success: true, data: item };
    }
  },
  {
    method: 'DELETE' as const,
    path: '/:id',
    validation: {
      params: ${className}ParamsSchema
    },
    description: 'Delete a ${name}',
    tags: ['${name}', 'delete'],
    handler: async (req: any, res: any) => {
      const success = await delete${className}(req.params.id, req.database, req.events);
      
      if (!success) {
        res.status(404);
        return { success: false, error: '${className} not found' };
      }
      
      return { success: true, message: '${className} deleted successfully' };
    }
  }
];`;
    
    return writeFile(join(modulePath, 'routes.ts'), content);
  }

  private writeSockets(modulePath: string, name: string) {
    const className = this.capitalize(name);
    const content = `// ${className} WebSocket Events
export const ${name}Sockets = [
  {
    event: 'join-${name}-room',
    handler: async (socket: any, data: any) => {
      socket.join(\`${name}-\${data.room}\`);
      return { success: true, room: data.room };
    },
    rateLimit: { requests: 10, window: 60000 }
  },
  {
    event: '${name}-update',
    handler: async (socket: any, data: any) => {
      socket.to(\`${name}-\${data.room}\`).emit('${name}-updated', data);
      return { success: true, data: data };
    },
    rateLimit: { requests: 20, window: 60000 },
    broadcast: true
  }
];`;
    
    return writeFile(join(modulePath, 'sockets.ts'), content);
  }

  private async writeDatabase(modulePath: string, name: string) {
    const className = this.capitalize(name);
    
    // Create database directory structure
    await mkdir(join(modulePath, 'database'), { recursive: true });
    await mkdir(join(modulePath, 'database', 'migrations'), { recursive: true });
    await mkdir(join(modulePath, 'database', 'seeds'), { recursive: true });
    
    // Schema
    const schemaContent = `-- ${className} Module Database Schema
CREATE TABLE IF NOT EXISTS ${name}s (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_${name}s_name ON ${name}s(name);
CREATE INDEX IF NOT EXISTS idx_${name}s_created_at ON ${name}s(created_at);`;
    
    await writeFile(join(modulePath, 'database', 'schema.sql'), schemaContent);
    
    // Migration
    const migrationContent = `-- Migration 001: Create ${name}s table
CREATE TABLE ${name}s (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_${name}s_name ON ${name}s(name);
CREATE INDEX idx_${name}s_created_at ON ${name}s(created_at);`;
    
    await writeFile(join(modulePath, 'database', 'migrations', '001_create_' + name + 's.sql'), migrationContent);
    
    // Seeds
    const seedContent = `-- Sample ${className} Data
INSERT INTO ${name}s (name, description) VALUES
('Sample ${className} 1', 'This is a sample ${name} item'),
('Sample ${className} 2', 'Another sample ${name} item');`;
    
    return writeFile(join(modulePath, 'database', 'seeds', 'sample_' + name + 's.sql'), seedContent);
  }

  private writeIndex(modulePath: string, name: string, hasWebSocket: boolean) {
    const className = this.capitalize(name);
    const content = `// ${className} Module - Functional Structure
import { config } from './config';
import { routes } from './routes';${hasWebSocket ? `
import { ${name}Sockets as sockets } from './sockets';` : ''}
import { defineModule } from '@morojs/moro';

export default defineModule({
  name: '${name}',
  version: '1.0.0',
  config,
  routes${hasWebSocket ? `,
  sockets` : ''}
});

// Re-export types and actions for direct usage
export * from './types';
export * from './actions';`;
    
    return writeFile(join(modulePath, 'index.ts'), content);
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
} 