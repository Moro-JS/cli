# @morojs/cli

**MoroJS Framework - Comprehensive Development Toolkit**

The official CLI for the MoroJS framework, providing a complete set of tools for building modern, high-performance APIs and microservices.

## Features

- **Project Initialization** - Create new projects with intelligent defaults
- **Advanced Module Generation** - Create modules with built-in middleware and features
- **Configuration Management** - Generate and validate MoroJS configurations
- **Database Management** - Setup adapters, run migrations, and seed data
- **Multi-Runtime Deployment** - Deploy to Vercel, AWS Lambda, Cloudflare Workers
- **Middleware Management** - Add and configure built-in middleware
- **Development Tools** - Dev server, build, lint, test commands
- **Security Scanning** - Built-in security analysis tools

## Quick Start

```bash
# Install globally
npm install -g @morojs/cli

# Create a new project
morojs-cli init my-api --runtime=node --database=postgresql --features=auth,cors,docs --validation=zod

# Navigate to project
cd my-api

# Start development server
npm run dev
```

## Commands

### Project Management

```bash
# Initialize new project
morojs-cli init <project-name> [options]
  -r, --runtime <type>      Runtime adapter (node|vercel-edge|aws-lambda|cloudflare-workers)
  -d, --database <type>     Database adapter (mysql|postgresql|sqlite|mongodb|redis|drizzle)
  -f, --features <list>     Features (auth,cors,helmet,compression,websocket,docs)
  -w, --websocket <adapter> WebSocket adapter (auto-detect|socket.io|ws|none)
  -v, --validation <lib>    Validation library (zod|joi|yup|class-validator|multiple)
  -t, --template <type>     Template (api|fullstack|microservice)
  --skip-git               Skip Git initialization
  --skip-install           Skip npm install
```

### Module Development

```bash
# Create advanced module
morojs-cli module create <name> [options]
  -f, --features <list>     Features (websocket,database,auth,cache,validation,docs)
  -d, --database <type>     Database adapter type
  -m, --middleware <list>   Built-in middleware (auth,cors,rate-limit,cache,validation)
  -r, --routes <pattern>    Route patterns (crud,rest,graphql)
  --auth-roles <roles>      Authentication roles
  --with-tests             Generate test files
  --with-docs              Generate API documentation

# List modules
morojs-cli module list

# Legacy module generation
morojs-cli generate <name> --features=websocket,database
```

### Configuration

```bash
# Generate configuration
morojs-cli config init [options]
  -e, --environment <env>   Environment (development|staging|production)
  -d, --database <type>     Primary database type
  -r, --runtime <type>      Runtime adapter type

# Validate configuration
morojs-cli config validate

# Generate .env template
morojs-cli config env --environment=production
```

### Database Management

```bash
# Setup database adapter
morojs-cli db setup <type> [options]
  -h, --host <host>         Database host
  -p, --port <port>         Database port
  -u, --username <user>     Database username
  -d, --database <db>       Database name
  --with-migrations        Generate migration system
  --with-seeds             Generate seed system

# Run migrations
morojs-cli db migrate --up|--down|--reset

# Seed database
morojs-cli db seed --environment=development
```

### Middleware Management

```bash
# Add middleware
morojs-cli middleware add <type> [options]
  -c, --config <json>       Middleware configuration

# List available middleware
morojs-cli middleware list
```

### Deployment

```bash
# Vercel Edge deployment
morojs-cli deploy vercel --domain=myapi.vercel.app

# AWS Lambda deployment
morojs-cli deploy lambda --region=us-west-2 --memory=1024

# Cloudflare Workers deployment
morojs-cli deploy workers --name=my-worker
```

### Development Tools

```bash
# Development server with hot reload
morojs-cli dev --port=3000 --watch=./modules

# Build for production
morojs-cli build --target=lambda --minify

# Code quality (linting, formatting, testing)
npm run validate            # Full validation pipeline
npm run lint               # Lint and fix issues
npm run format             # Format code with Prettier
npm run test               # Run test suite
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Generate coverage report

# Security scan
morojs-cli security:scan
```

## Project Templates

### API Server

```bash
morojs-cli init my-api --template=api --runtime=node --database=postgresql --validation=zod
```

Perfect for REST APIs, GraphQL servers, and backend services.

### Microservice

```bash
morojs-cli init my-service --template=microservice --runtime=vercel-edge --validation=yup
```

Lightweight services optimized for serverless deployment.

### Real-time Application

```bash
morojs-cli init my-chat --features=websocket,auth --websocket=socket.io --validation=joi
```

Real-time applications with WebSocket support and flexible validation.

### Full-stack

```bash
morojs-cli init my-app --template=fullstack --features=auth,websocket,docs --validation=multiple
```

Complete application with frontend integration support and all validation libraries.

## Runtime Adapters

| Runtime                | Description                            | Deploy Command              |
| ---------------------- | -------------------------------------- | --------------------------- |
| **Node.js**            | Traditional server deployment          | `node dist/index.js`        |
| **Vercel Edge**        | Edge runtime with global distribution  | `morojs-cli deploy vercel`  |
| **AWS Lambda**         | Serverless functions with auto-scaling | `morojs-cli deploy lambda`  |
| **Cloudflare Workers** | Edge workers with V8 isolates          | `morojs-cli deploy workers` |

## Database Support

- **PostgreSQL** - Full-featured relational database
- **MySQL/MariaDB** - Popular relational database
- **SQLite** - Lightweight embedded database
- **MongoDB** - Document-oriented database
- **Redis** - In-memory data structure store
- **Drizzle ORM** - Type-safe database toolkit

## WebSocket Support

- **Auto-detect** - Automatically detects and uses available WebSocket libraries
- **Socket.IO** - Feature-rich with rooms, namespaces, and real-time communication
- **Native ws** - Lightweight, standards-compliant WebSocket implementation
- **None** - Skip WebSocket dependencies for minimal builds

## Validation Libraries

- **Zod** - Type-safe validation with TypeScript integration (recommended)
- **Joi** - Mature validation library with extensive features
- **Yup** - Simple and popular validation library
- **Class Validator** - Decorator-based validation for TypeScript classes
- **Multiple** - Install all libraries for maximum flexibility

## Built-in Middleware

- **Authentication** - JWT, Session, OAuth support
- **CORS** - Cross-Origin Resource Sharing
- **Rate Limiting** - Request throttling and protection
- **Caching** - Response caching (Memory, Redis, File)
- **Validation** - Universal validation (Zod, Joi, Yup, Class Validator)
- **Security Headers** - Helmet.js integration
- **Compression** - Gzip/Brotli response compression
- **Session Management** - Secure session handling
- **CSRF Protection** - Cross-Site Request Forgery prevention

## Examples

### Create a User Management API

```bash
# Initialize project with Joi validation
morojs-cli init user-api --runtime=node --database=postgresql --features=auth,docs --validation=joi

# Create users module
morojs-cli module create users --features=database,auth,cache --middleware=rate-limit --with-tests

# Setup database
morojs-cli db setup postgresql --host=localhost --database=userapi --with-migrations

# Add authentication middleware
morojs-cli middleware add auth --config='{"strategy":"jwt","expiresIn":"7d"}'

# Start development
npm run dev
```

### Serverless Microservice

```bash
# Create lightweight service
morojs-cli init payment-service --template=microservice --runtime=aws-lambda --database=redis

# Create payment module
morojs-cli module create payments --features=validation,cache --middleware=rate-limit

# Setup deployment
morojs-cli deploy lambda --region=us-east-1 --memory=512

# Deploy
npm run deploy:lambda
```

### Full-stack Application

```bash
# Create full-stack app with Socket.IO and multiple validation libraries
morojs-cli init chat-app --template=fullstack --features=websocket,auth,docs --database=mongodb --websocket=socket.io --validation=multiple

# Create chat module
morojs-cli module create chat --features=websocket,database,auth --with-tests

# Create users module
morojs-cli module create users --features=database,auth,validation --with-tests

# Start development
npm run dev
```

## Configuration

MoroJS CLI respects configuration from multiple sources:

1. **Command line arguments** (highest priority)
2. **Environment variables** (`MORO_*` prefix)
3. **moro.config.ts** configuration file
4. **package.json** `morojs` field
5. **Default values** (lowest priority)

### Environment Variables

```bash
# Logging
LOG_LEVEL=debug
MORO_LOG_LEVEL=info

# Development
MORO_DEV_PORT=3000
MORO_DEV_HOST=localhost

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secret-key
CORS_ORIGIN=https://yourdomain.com
```

## Development & Testing

Generated projects include a complete development workflow:

### Available Scripts

```bash
# Development
npm run dev                 # Start development server
npm run build              # Build for production

# Code Quality
npm run validate           # Run all quality checks
npm run lint               # ESLint with auto-fix
npm run lint:check         # ESLint check only
npm run format             # Prettier formatting
npm run format:check       # Check formatting
npm run typecheck          # TypeScript compilation check

# Testing
npm run test               # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

### Quality Standards

All generated projects include:

- **TypeScript** for type safety
- **ESLint** for code quality
- **Prettier** for consistent formatting
- **Jest** for testing with TypeScript support
- **GitHub Actions** for CI/CD

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- **Documentation**: [https://morojs.com](https://morojs.com)
- **GitHub**: [https://github.com/Moro-JS/cli](https://github.com/Moro-JS/cli)
- **NPM**: [https://www.npmjs.com/package/@morojs/cli](https://www.npmjs.com/package/@morojs/cli)
- **Discord**: [Join our community](https://morojs.com/discord)

---

**Built with ❤️ by the MoroJS Team**
