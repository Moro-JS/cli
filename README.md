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

`init` has two modes, picked automatically based on which flags you pass:

| Mode                | Trigger                                                                                                  | Behavior                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Interactive**     | None of the flags below                                                                                  | Walks you through each option step-by-step. Prints the equivalent non-interactive command at the end so you can repeat it.             |
| **Non-interactive** | `--fast`, or any of `--runtime`, `--database`, `--features`, `--websocket`, `--validation`, `--template` | Skips all prompts. Anything you didn't pass falls back to defaults: `runtime=node`, `database=none`, `template=api`, `validation=zod`. |

`--package-manager`, `--force`, `--dry-run`, `--skip-git` and `--skip-install` do not change the mode on their own; add `--fast` to skip the prompts.

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
  --dry-run                    Print what would be created (the files init writes, resolved
                               config, equivalent command) without writing any files
  --skip-git                   Skip Git initialization
  --skip-install               Skip dependency installation
```

The CLI auto-detects which package manager invoked it (npm/yarn/pnpm via `npm_config_user_agent`) and uses it for the install step and for the scripts in the generated README. Override explicitly with `--package-manager`.

> Bun is intentionally **not** included as a package-manager option: `@morojs/moro` targets the Node.js runtime (its native HTTP engine is built per Node.js ABI) and bun-as-runtime is not officially supported yet.

Every `--database` choice generates a working `src/database/index.ts` and installs the driver it imports: `pg` (postgresql, drizzle), `mysql2`, `mongodb`, `better-sqlite3` and `redis`. The variables that file reads are the ones written to `.env`.

With the `cors` feature, development allows any origin. In production (`NODE_ENV=production`) only the origins listed in `CORS_ORIGIN` (comma-separated) are allowed; while it is empty the CORS middleware stays off and a warning is logged at start-up.

The node runtime also gets a `Dockerfile`, a `.dockerignore` and, with a database, a `docker-compose.yml` that starts the app together with its database.

### Module Development

```bash
# Create a module in src/modules/<name>
npx @morojs/cli module create <name> [options]
  -f, --features <list>     Features (websocket,database,auth,cache,validation,docs)
  -d, --database <type>     Database adapter type
  -m, --middleware <list>   Built-in middleware (auth,cors,rate-limit,cache,validation)
  -r, --routes <pattern>    Route patterns (crud,rest,graphql)
  -t, --template <template> Module template (service,controller,repository)
  --auth-roles <roles>      Authentication roles
  --with-tests              Generate test files
  --with-docs               Generate API documentation

# List modules
npx @morojs/cli module list
```

Every module gets `types.ts`, `schemas.ts` (Zod), `config.ts`, `actions.ts`, `routes.ts` (CRUD) and `index.ts`. `--features=websocket` adds `sockets.ts`; `--features=database` adds `database/` with a schema, a migration and a seed file. The other feature values and `--database`, `--middleware`, `--routes`, `--template`, `--auth-roles`, `--with-tests` and `--with-docs` are accepted but not applied today; the command prints a warning for each one it did not apply.

The routes are served under `/api/v1.0.0/<name>` and keep their records in memory until you replace `collection()` in `actions.ts` with your own database queries.

### Configuration

```bash
# Generate configuration
npx @morojs/cli config init [options]
  -e, --environment <env>   Environment (development|staging|production)
  -d, --database <type>     Primary database type
  -r, --runtime <type>      Runtime adapter type (vercel-edge, aws-lambda and
                            cloudflare-workers leave out connection limits and clustering)

# Validate configuration (bundles moro.config.ts first, so it works on every supported Node version)
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

# List migration files and how to apply them
npx @morojs/cli db migrate --up|--down|--reset

# List seed files and how to load them
npx @morojs/cli db seed --environment=development
```

`db setup` writes `src/database/index.ts` on top of the framework's database adapter for that type; `--host`, `--port`, `--username` and `--database` become the defaults in that file and in `.env.example`. `--with-migrations` and `--with-seeds` add `MigrationRunner` and `SeedRunner` classes that you call from your own code with the connected adapter.

`db migrate` and `db seed` do not connect to a database: they report the files they found and point at those runners. Neither command executes SQL.

### Middleware Management

```bash
# Add middleware: writes src/middleware/<type>_middleware.ts
npx @morojs/cli middleware add <type> [options]
  -c, --config <json>       Middleware configuration, merged over the defaults

# List built-in middleware: the types "add" can generate, then the rest
npx @morojs/cli middleware list
```

The generated files call the framework's own factories: `middleware.cors()`, `middleware.rateLimit()`, `middleware.cache()`, `middleware.validation()`, `middleware.helmet()`, `middleware.compression()` and `auth()` with email and password sign-in on Better Auth. `--config` keys are mapped to the option names those factories take:

| Type          | Keys                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cors`        | `origin`, `methods`, `allowedHeaders`, `exposedHeaders`, `credentials`, `maxAge`, `preflightContinue`                                                                                             |
| `rate-limit`  | `windowMs` / `window`, `max` / `requests`, `message`, `statusCode`, `skipSuccessfulRequests`, `skipFailedRequests`                                                                                |
| `cache`       | `ttl` (written as `defaultTtl`), `strategy` when it names a store (`memory`, `redis`, `file`; written as `adapter`), `adapterOptions`, `strategies`, `keyPrefix`, `httpCaching`, `maxAge`, `etag` |
| `helmet`      | `contentSecurityPolicy`, `referrerPolicy`, and `frameguard`, `hsts`, `noSniff`, `xssFilter`, `ieNoOpen`, `permittedCrossDomainPolicies` under the names the factory uses                          |
| `compression` | `level`, `threshold`, `encodings`, `maxInlineBytes`                                                                                                                                               |
| `auth`        | `secret`, `expiresIn` (`24h`, `7d`, seconds; written as `session.maxAge`), `basePath`, `baseURL`, `trustedOrigins`, `debug`, `useSecureCookies`                                                   |
| `validation`  | none: `middleware.validation()` takes no options                                                                                                                                                  |

Any other key is still accepted, and the command prints one warning naming the keys it did not apply.

The `auth` file imports the `better-auth` package, so the project needs it (`npm install better-auth`). It sets up email and password sign-in, sessions and, once a provider's client id and secret are in the environment, GitHub and Google sign-in. It knows nothing about the project's database: users and sessions start in Better Auth's in-memory store, which is gone at restart, and the file says what to pass as `betterAuth.database` instead. `strategy` and `trustHost` have no equivalent on Better Auth and are not applied.

### Deployment

```bash
# Vercel Edge: writes vercel.json and deploy-vercel.sh
npx @morojs/cli deploy vercel --domain=myapi.vercel.app

# AWS Lambda: writes serverless.yml and deploy-lambda.sh
npx @morojs/cli deploy lambda --region=us-west-2 --memory=1024

# Cloudflare Workers: writes wrangler.toml and deploy-workers.sh
npx @morojs/cli deploy workers --name=my-worker
```

The commands generate configuration and an executable `deploy-*.sh`; nothing is deployed until you run that script. The Lambda and Workers scripts build with `build --target`, and their configuration points at the `dist/runtime.js` that build writes.

### Development Tools

```bash
# Development server with hot reload (--watch replaces src, comma-separated)
npx @morojs/cli dev --port=3000 --watch=src,config

# Build for production
npx @morojs/cli build --target=lambda --minify
  -t, --target <target>     node|edge|lambda|workers. The last three also write
                            <output>/runtime.js, the entry file for that platform
  -o, --output <dir>        Compile into this directory instead of tsconfig's outDir
  --minify                  Minify the emitted JavaScript in place

# Dependency audit
npx @morojs/cli security:scan
```

`dev` runs `npm run build && node <entry>` and runs it again whenever a `.ts`, `.js` or `.json` file under the watched paths changes, or when you enter `rs`. Node.js before 22.18 cannot load the project's `moro.config.ts` and TypeScript routes itself, so there the entry runs through the project's `tsx` (`npm run build && tsx <entry>`); a TypeScript project without `tsx` gets one line saying what is missing. Dot files and `node_modules`, `coverage` and `.git` directories are not watched. `--port` and `--host` reach the app as `PORT` and `HOST`; without them the project's own `.env` decides. Ctrl+C stops the app and the command. A project that has nodemon installed runs under nodemon instead, with its own nodemon configuration.

`security:scan` runs `npm audit`, prints its report and exits non-zero when vulnerabilities are found. It does not inspect source code.

### Global Options

```bash
--verbose    Enable verbose (debug) logging: commands that are run, files that are written
--quiet      Suppress all output except errors (also the init banner, spinners and summary)
```

Both also set `LOG_LEVEL` (`debug` / `error`) for the processes a command starts.

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
| **Node.js** (default)  | Traditional server deployment          | `node dist/src/index.js`         |
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
npx @morojs/cli module create users --features=database

# Setup database
npx @morojs/cli db setup postgresql --host=localhost --database=userapi --with-migrations

# Add authentication middleware
npx @morojs/cli middleware add auth --config='{"expiresIn":"7d"}'

# Start development
npm run dev
```

### Serverless Microservice

```bash
# Create lightweight service
npx @morojs/cli init payment-service --template=microservice --runtime=aws-lambda --database=redis

# Create payment module
npx @morojs/cli module create payments

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
npx @morojs/cli module create chat --features=websocket,database

# Create users module
npx @morojs/cli module create users --features=database

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
JWT_SECRET=                 # generate with: openssl rand -hex 32
CORS_ORIGIN=https://yourdomain.com

# Disable the update-notifier check
NO_UPDATE_NOTIFIER=1
```

## Generated Project Scripts

Generated projects get these scripts (the generated README prints them with the package manager you picked):

```bash
npm run dev                 # tsx watch src/index.ts
npm run build               # tsc (compiles to dist/, entry dist/src/index.js)
npm start                   # run the compiled entry
npm test                    # Jest, when the testing feature is selected
npm run lint                # morojs-cli lint
npm run db:migrate          # morojs-cli db migrate --up (lists the migration files)
npm run db:seed             # morojs-cli db seed (lists the seed files)
npm run deploy:vercel       # vercel-edge runtime only; deploy:lambda / deploy:workers likewise
```

- **`npm start`** on the node runtime runs `tsx dist/src/index.js`, and `tsx` is a runtime dependency there. The framework imports `moro.config.ts` at start-up and, outside production, the TypeScript files under `src/routes` and `src/modules`; Node.js before 22.18 cannot import TypeScript on its own, so plain `node` skipped them on Node 20. The generated Dockerfile runs plain `node` in production mode with the compiled configuration.
- **`npm test`** with the `testing` feature runs `node --experimental-vm-modules node_modules/jest/bin/jest.js`: the project is an ES module package, so `jest.config.js` is an ES module and Jest runs in ES module mode. The sample `tests/app.test.ts` starts the app on a free port (node runtime) or calls the exported handler (other runtimes). Without the feature the script is `morojs-cli test`, which tells you what to install.

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
