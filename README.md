# @morojs/cli

**MoroJS Framework — Comprehensive Development Toolkit**

The official CLI for the MoroJS framework, providing a complete set of tools for building modern, high-performance APIs and microservices.

## Features

- **Project Initialization** — interactive or one-shot non-interactive mode
- **Advanced Module Generation** — modules with built-in middleware and features
- **Configuration Management** — generate and validate MoroJS configurations
- **Database Management** — setup adapters, run migrations, seed data
- **Multi-Runtime Deployment** — Vercel, AWS Lambda, Cloudflare Workers
- **Middleware Management** — add and configure built-in middleware
- **Development Tools** — dev server, build, lint, test commands
- **Security Scanning** — built-in security analysis tools
- **Friendly errors** — typos in flag values surface "did you mean…?" hints
- **Update notifier** — pings you when a newer CLI version is available

## Quick Start

The recommended way to run the CLI is via `npx` — no install required:

```bash
# Interactive (guided prompts)
npx @morojs/cli init my-api

# Non-interactive (any flag, or --fast, skips prompts)
npx @morojs/cli init my-api --fast
npx @morojs/cli init my-api --database=postgresql --features=auth,cors,docs
```

Prefer a global install? Three binary names are provided: `morojs-cli`, `moro-cli`, or the short alias `moro`.

```bash
npm install -g @morojs/cli
moro init my-api --fast
```

## Init Modes

`init` has two modes, picked automatically based on whether you pass any flag:

| Mode                | Trigger                | Behavior                                                                                                                               |
| ------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Interactive**     | No flags               | Walks you through each option step-by-step. Prints the equivalent non-interactive command at the end so you can repeat it.             |
| **Non-interactive** | Any flag (or `--fast`) | Skips all prompts. Anything you didn't pass falls back to defaults: `runtime=node`, `database=none`, `template=api`, `validation=zod`. |

Flag values are validated up-front. `--runtime=nod` or `--features=corss` errors out with a "did you mean…?" hint instead of silently producing a broken project. Project names are checked against npm package-name rules.

## Commands

### Project Initialization

```bash
npx @morojs/cli init <project-name> [options]
  -t, --template <type>        Template (api|microservice|fullstack)
  -r, --runtime <type>         Runtime (node|vercel-edge|aws-lambda|cloudflare-workers) [default: node]
  -d, --database <type>        Database (mysql|postgresql|sqlite|mongodb|redis|drizzle|none)
  -v, --validation <lib>       Validation (zod|joi|yup|class-validator|multiple)
  -w, --websocket <adapter>    WebSocket (auto-detect|socket.io|ws|none)
  -f, --features <list>        Features (auth,cors,helmet,compression,websocket,docs,
                               rate-limit,cache,circuit-breaker,monitoring,testing)
  -p, --package-manager <pm>   Package manager (npm|yarn|pnpm) [auto-detected from npm_config_user_agent]
  --fast                       Skip all prompts and use sensible defaults
  --force                      Overwrite existing directory without prompting
  --dry-run                    Print what would be created (file tree, resolved config,
                               equivalent command) without writing any files
  --skip-git                   Skip Git initialization
  --skip-install               Skip dependency installation
```

The CLI auto-detects which package manager invoked it (npm/yarn/pnpm via `npm_config_user_agent`) and uses it for the install step and for the scripts in the generated README. Override explicitly with `--package-manager`.

> Bun is intentionally **not** included as a package-manager option: `@morojs/moro` targets the Node.js runtime (it depends on `uWebSockets.js`' native N-API bindings) and bun-as-runtime is not officially supported yet.

### Module Development

```bash
# Create advanced module
npx @morojs/cli module create <name> [options]
  -f, --features <list>     Features (websocket,database,auth,cache,validation,docs)
  -d, --database <type>     Database adapter type
  -m, --middleware <list>   Built-in middleware (auth,cors,rate-limit,cache,validation)
  -r, --routes <pattern>    Route patterns (crud,rest,graphql)
  --auth-roles <roles>      Authentication roles
  --with-tests              Generate test files
  --with-docs               Generate API documentation

# List modules
npx @morojs/cli module list
```

### Configuration

```bash
# Generate configuration
npx @morojs/cli config init [options]
  -e, --environment <env>   Environment (development|staging|production)
  -d, --database <type>     Primary database type
  -r, --runtime <type>      Runtime adapter type

# Validate configuration
npx @morojs/cli config validate

# Generate .env template
npx @morojs/cli config env --environment=production
```

### Database Management

```bash
# Setup database adapter
npx @morojs/cli db setup <type> [options]
  -h, --host <host>         Database host
  -p, --port <port>         Database port
  -u, --username <user>     Database username
  -d, --database <db>       Database name
  --with-migrations         Generate migration system
  --with-seeds              Generate seed system

# Run migrations
npx @morojs/cli db migrate --up|--down|--reset

# Seed database
npx @morojs/cli db seed --environment=development
```

### Middleware Management

```bash
# Add middleware
npx @morojs/cli middleware add <type> [options]
  -c, --config <json>       Middleware configuration

# List available middleware
npx @morojs/cli middleware list
```

### Deployment

```bash
# Vercel Edge deployment
npx @morojs/cli deploy vercel --domain=myapi.vercel.app

# AWS Lambda deployment
npx @morojs/cli deploy lambda --region=us-west-2 --memory=1024

# Cloudflare Workers deployment
npx @morojs/cli deploy workers --name=my-worker
```

### Development Tools

```bash
# Development server with hot reload
npx @morojs/cli dev --port=3000 --watch=./modules

# Build for production
npx @morojs/cli build --target=lambda --minify

# Security scan
npx @morojs/cli security:scan
```

### Global Options

```bash
--verbose    Enable verbose (debug) logging
--quiet      Suppress all output except errors
```

`--verbose` and `--quiet` are mutually exclusive — passing both errors out.

## Project Templates

### API Server

```bash
npx @morojs/cli init my-api --template=api --database=postgresql --validation=zod
```

Perfect for REST APIs, GraphQL servers, and backend services.

### Microservice

```bash
npx @morojs/cli init my-service --template=microservice --runtime=vercel-edge --validation=yup
```

Lightweight services optimized for serverless deployment.

### Real-time Application

```bash
npx @morojs/cli init my-chat --features=websocket,auth --websocket=socket.io --validation=joi
```

Real-time applications with WebSocket support and flexible validation.

### Full-stack

```bash
npx @morojs/cli init my-app --template=fullstack --features=auth,websocket,docs --validation=multiple
```

Complete application with frontend integration support and all validation libraries.

## Runtime Adapters

| Runtime                | Description                            | Deploy Command                   |
| ---------------------- | -------------------------------------- | -------------------------------- |
| **Node.js** (default)  | Traditional server deployment          | `node dist/index.js`             |
| **Vercel Edge**        | Edge runtime with global distribution  | `npx @morojs/cli deploy vercel`  |
| **AWS Lambda**         | Serverless functions with auto-scaling | `npx @morojs/cli deploy lambda`  |
| **Cloudflare Workers** | Edge workers with V8 isolates          | `npx @morojs/cli deploy workers` |

## Database Support

- **PostgreSQL** — Full-featured relational database
- **MySQL/MariaDB** — Popular relational database
- **SQLite** — Lightweight embedded database
- **MongoDB** — Document-oriented database
- **Redis** — In-memory data structure store
- **Drizzle ORM** — Type-safe database toolkit
- **None** — Skip database setup entirely

## WebSocket Support

- **Auto-detect** — Automatically picks an available WebSocket library (default)
- **Socket.IO** — Feature-rich with rooms, namespaces, and real-time communication
- **Native ws** — Lightweight, standards-compliant WebSocket implementation
- **None** — Skip WebSocket dependencies for minimal builds

## Validation Libraries

- **Zod** (default) — Type-safe validation with TypeScript integration
- **Joi** — Mature validation library with extensive features
- **Yup** — Simple and popular validation library
- **Class Validator** — Decorator-based validation for TypeScript classes
- **Multiple** — Install all libraries for maximum flexibility

## Built-in Middleware

- **Authentication** — JWT, Session, OAuth support
- **CORS** — Cross-Origin Resource Sharing
- **Rate Limiting** — Request throttling and protection
- **Caching** — Response caching (Memory, Redis, File)
- **Validation** — Universal validation (Zod, Joi, Yup, Class Validator)
- **Security Headers** — Helmet.js integration
- **Compression** — Gzip/Brotli response compression
- **Session Management** — Secure session handling
- **CSRF Protection** — Cross-Site Request Forgery prevention

## Examples

### Preview a project before creating it

```bash
npx @morojs/cli init my-api --fast --dry-run
```

Prints the resolved config, the file tree that _would_ be created, and the equivalent non-interactive command — without touching the filesystem.

### Use pnpm instead of npm

```bash
npx @morojs/cli init my-api --fast --package-manager=pnpm
# or invoke via pnpm and let the CLI auto-detect:
pnpm dlx @morojs/cli init my-api --fast
```

### Create a User Management API

```bash
# Initialize project with Joi validation
npx @morojs/cli init user-api --database=postgresql --features=auth,docs --validation=joi

# Create users module
npx @morojs/cli module create users --features=database,auth,cache --middleware=rate-limit --with-tests

# Setup database
npx @morojs/cli db setup postgresql --host=localhost --database=userapi --with-migrations

# Add authentication middleware
npx @morojs/cli middleware add auth --config='{"strategy":"jwt","expiresIn":"7d"}'

# Start development
npm run dev
```

### Serverless Microservice

```bash
# Create lightweight service
npx @morojs/cli init payment-service --template=microservice --runtime=aws-lambda --database=redis

# Create payment module
npx @morojs/cli module create payments --features=validation,cache --middleware=rate-limit

# Setup deployment
npx @morojs/cli deploy lambda --region=us-east-1 --memory=512

# Deploy
npm run deploy:lambda
```

### Full-stack Application

```bash
# Create full-stack app with Socket.IO and multiple validation libraries
npx @morojs/cli init chat-app --template=fullstack --features=websocket,auth,docs \
  --database=mongodb --websocket=socket.io --validation=multiple

# Create chat module
npx @morojs/cli module create chat --features=websocket,database,auth --with-tests

# Create users module
npx @morojs/cli module create users --features=database,auth,validation --with-tests

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

# Disable the update-notifier check
NO_UPDATE_NOTIFIER=1
```

## Generated Project Scripts

Generated projects include a complete development workflow. Script names use whichever package manager you picked (`npm run`, `yarn`, or `pnpm`):

```bash
# Development
npm run dev                 # Start development server
npm run build               # Build for production

# Code Quality
npm run validate            # Run all quality checks
npm run lint                # ESLint with auto-fix
npm run lint:check          # ESLint check only
npm run format              # Prettier formatting
npm run format:check        # Check formatting
npm run typecheck           # TypeScript compilation check

# Testing
npm run test                # Run all tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Quality Standards

All generated projects include:

- **TypeScript** for type safety
- **ESLint** for code quality
- **Prettier** for consistent formatting
- **Jest** for testing with TypeScript support
- **GitHub Actions** for CI/CD

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Links

- **Documentation**: [https://morojs.com](https://morojs.com)
- **GitHub**: [https://github.com/Moro-JS/cli](https://github.com/Moro-JS/cli)
- **NPM**: [https://www.npmjs.com/package/@morojs/cli](https://www.npmjs.com/package/@morojs/cli)
- **Discord**: [Join our community](https://morojs.com/discord)

---

**Built by the MoroJS Team**
