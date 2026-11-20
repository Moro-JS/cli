// Authentication scaffolding templates shared by `init --features=auth` and
// `middleware add auth`.
//
// Both commands write sign-in onto the framework's Better Auth adapter:
// email and password through `betterAuth: { emailAndPassword }`, OAuth through
// `providers`, a database through `betterAuth: { database }`. One source keeps
// the generated code, the entries written to `.env` and the generated README
// in agreement with each other.

/** Version range of `better-auth` written to a generated package.json. */
export const BETTER_AUTH_VERSION = '^1.7.7';

/**
 * Database choices whose connection Better Auth takes as it is and creates its
 * own tables in: the generated `src/database/index.ts` leaves a better-sqlite3
 * database, a pg pool or a mysql2 pool on `app.database`. The other choices
 * (MongoDB, Redis, Drizzle, none) need an adapter and a schema of the
 * project's own, so sign-in starts on Better Auth's in-memory store there.
 */
const WIRED_DATABASES: Record<string, { label: string; userTable: string }> = {
  sqlite: { label: 'SQLite', userTable: 'user' },
  postgresql: { label: 'PostgreSQL', userTable: '"user"' },
  mysql: { label: 'MySQL', userTable: 'user' },
};

/** True when sign-in is generated on the project's own database connection. */
export function authUsesProjectDatabase(database: string): boolean {
  return Object.prototype.hasOwnProperty.call(WIRED_DATABASES, database);
}

// Why sign-in is not on the project's database, for the choices that are not wired.
function unwiredReason(database: string): string {
  switch (database) {
    case 'mongodb':
      return 'This project uses MongoDB, which Better Auth reaches through an adapter that the scaffold does not set up';
    case 'drizzle':
      return 'This project uses Drizzle, which Better Auth reaches through an adapter and a schema that the scaffold does not set up';
    case 'redis':
      return 'This project uses Redis, which is not a database Better Auth keeps users in';
    default:
      return 'This project was scaffolded without a database';
  }
}

/** `text` as `//` comment lines, each paragraph wrapped at 80 columns. */
function commentBlock(paragraphs: string[]): string {
  return paragraphs
    .map(paragraph => {
      const lines: string[] = [];
      let line = '//';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line.length + 1 + word.length > 80 && line !== '//') {
          lines.push(line);
          line = '//';
        }
        line += ` ${word}`;
      }
      lines.push(line);
      return lines.join('\n');
    })
    .join('\n//\n');
}

// The OAuth providers of a generated file. Each one is configured only when
// both of its variables are set, so a project without them configures none.
const OAUTH_PROVIDERS_FUNCTION = `// OAuth providers. A provider is switched on by putting its client id and
// secret in the environment (.env); register
// <BASE_URL>/api/auth/callback/<provider> as the callback URL of its OAuth app.
// With none set the list is empty, and email and password is the way to sign in.
function oauthProviders(): AuthProvider[] {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } =
    process.env;
  const configured: AuthProvider[] = [];

  if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
    configured.push(
      providers.github({ clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET })
    );
  }
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    configured.push(
      providers.google({ clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET })
    );
  }

  return configured;
}`;

const MEMORY_ADAPTER = `memoryAdapter({ user: [], session: [], account: [], verification: [] })`;

/**
 * Source of `src/middleware/auth.ts`: exports `setupAuth(app)`, which
 * `src/index.ts` awaits after `setupDatabase(app)`.
 */
export function authSetupSource(database: string): string {
  const wired = WIRED_DATABASES[database];

  const needsDatabase =
    'The database. Better Auth keeps users, password hashes and sessions in a database, and ' +
    'email and password sign-in needs one.';
  const databaseComment = wired
    ? commentBlock([
        `${needsDatabase} This project gives it the ${wired.label} connection that ` +
          'src/database/index.ts opens (app.database). Its tables (user, session, account, ' +
          'verification) are created at start-up when they are missing.',
        'When that connection is missing at start-up, the app does not start if NODE_ENV is ' +
          'production. Anywhere else it starts with users and sessions in the memory of the ' +
          'process instead: sign-in works, everything is gone at restart, and nothing is ' +
          'shared between processes.',
      ])
    : commentBlock([
        `${needsDatabase} ${unwiredReason(database)}, so setupAuth() starts on Better Auth's ` +
          'memoryAdapter: users and sessions live in the memory of the process. Sign-in works, ' +
          'everything is gone at restart, and nothing is shared between processes.',
        'That is enough to try things out. Before real users sign up, give `database` below a ' +
          'better-sqlite3, pg or mysql2 connection (Better Auth creates its tables in those ' +
          'with getMigrations()) or a Drizzle, Prisma or MongoDB adapter: ' +
          'https://better-auth.com/docs/concepts/database',
      ]);

  const frameworkImports = [
    'bearerToken',
    'createAuthMiddleware',
    'createFrameworkLogger',
    ...(wired ? ['MoroJSAuth'] : []),
    'providers',
    'requireAdmin',
    'requireAuth',
  ];

  const connectionSetup = wired
    ? `
  // The connection setupDatabase() stored on the app. When it could not connect
  // there is none: app.database is then still the framework's own method.
  const connection = Object.hasOwn(app, 'database') ? app.database : undefined;
  if (!connection) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Sign-in needs the ${wired.label} connection, and src/database/index.ts did not open one ' +
          '(it logged the reason). Fix the connection and start again.'
      );
    }
    logger.warn(
      'No database connection: sign-in keeps users and sessions in memory until the next restart.',
      'Auth'
    );
  }
`
    : `
  if (process.env.NODE_ENV === 'production') {
    logger.warn(
      'Sign-in keeps users and sessions in memory: they are gone at restart. ' +
        'Give Better Auth a database in src/middleware/auth.ts.',
      'Auth'
    );
  }
`;

  const databaseOption = wired
    ? `      // Users, password hashes and sessions: the project's database, or the
      // memory of the process when it is not connected (see the top of this file).
      database:
        connection ?? ${MEMORY_ADAPTER},`
    : `      // Users, password hashes and sessions: the memory of the process (see the
      // top of this file for what to pass instead).
      database: ${MEMORY_ADAPTER},`;

  const migrations = wired
    ? `
  if (connection) {
    // Create the tables and columns this configuration writes to. Nothing
    // changes when they are already there.
    const { instance } = await MoroJSAuth(authConfig);
    const { runMigrations } = await getMigrations(instance.options);
    await runMigrations();
  }
`
    : '';

  return `// Authentication: sign-in and sessions on Better Auth
//
// setupAuth() gives the app:
//   - email and password: POST /api/auth/sign-up/email, POST /api/auth/sign-in/email
//   - the session:        GET /api/auth/get-session, POST /api/auth/sign-out
//   - OAuth:              GET /api/auth/signin/github and /google, once the
//                         provider's client id and secret are in the environment
//   - req.auth on every request, which the guards on /api/profile and
//     /api/admin read
//
${databaseComment}
import {
${frameworkImports.map(name => `  ${name}`).join(',\n')}
} from '@morojs/moro';
import type { AuthProvider } from '@morojs/moro';
import { memoryAdapter } from 'better-auth/adapters/memory';${
    wired ? `\nimport { getMigrations } from 'better-auth/db/migration';` : ''
  }
import { getAuthSecret } from './auth-secret.js';

const logger = createFrameworkLogger('Auth');

${OAUTH_PROVIDERS_FUNCTION}

export async function setupAuth(app: any): Promise<void> {
  // Resolve the signing secret once, while the app boots. getAuthSecret() throws
  // when AUTH_SECRET is unset or still a placeholder, so a misconfigured
  // deployment fails at startup instead of signing sessions with a known key.
  const secret = getAuthSecret();
${connectionSetup}
  const authConfig = {
    secret,
    providers: oauthProviders(),
    session: {
      maxAge: 8 * 60 * 60 // 8 hours, in seconds
    },
    // The token a sign-up or sign-in answers with is also accepted as
    // "Authorization: Bearer <token>", for clients that keep no cookies.
    plugins: [bearerToken()],
    // Options handed to Better Auth as they are.
    betterAuth: {
${databaseOption}
      emailAndPassword: { enabled: true },
      user: {
        additionalFields: {
          // What requireRole() and requireAdmin() check: role names separated by
          // commas or spaces. A new user gets 'user', and a sign-up cannot set it.
          roles: { type: 'string', defaultValue: 'user', input: false }
        }
      }
    }
  };
${migrations}
  // Serves the routes under /api/auth and sets req.auth on every request.
  await app.use(createAuthMiddleware(authConfig));

  // A signed-in user: 401 without a session.
  app.get('/api/profile')
    .describe('Get the signed-in user')
    .tag('Authentication')
    .before(requireAuth())
    .handler(async (req: any) => {
      return {
        success: true,
        user: req.auth.user
      };
    });

  // A signed-in user with the admin role: 401 without a session, 403 without the role.
  app.get('/api/admin')
    .describe('Admin role required')
    .tag('Authentication')
    .before(requireAdmin())
    .handler(async (req: any) => {
      return {
        success: true,
        message: 'Admin access granted',
        user: req.auth.user
      };
    });
}
`;
}

/**
 * Source of `src/middleware/auth-secret.ts`: the one place a generated project
 * reads AUTH_SECRET. There is deliberately no fallback literal: an unset or
 * placeholder secret stops the app at boot.
 */
export function authSecretSource(): string {
  return `// AUTH_SECRET loader
//
// The secret that signs sessions comes from the environment and nowhere else -
// there is deliberately no fallback value in code. The scaffold wrote a random
// secret to .env for local development; every deployed environment must set its
// own (generate one with: openssl rand -hex 32).

// Values that have appeared in templates, docs and examples. Anyone can sign
// a session with these, so they are rejected rather than used.
const PLACEHOLDER_SECRETS = new Set([
  'your-super-secret-jwt-key-change-this-in-production',
  'dev-insecure-secret-change-me',
  'your-secret-key',
  'dev-secret',
  'change-me',
  'changeme',
  'secret'
]);

/**
 * Returns the signing secret from AUTH_SECRET.
 *
 * Throws when the variable is unset, empty, or still a known placeholder.
 * setupAuth() calls this once while the app boots, so a misconfigured
 * deployment fails at startup instead of issuing sessions anyone can forge.
 */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error(
      'AUTH_SECRET is not set. Add it to .env for local development, or to the ' +
        'environment of your deployment. Generate one with: openssl rand -hex 32'
    );
  }

  if (PLACEHOLDER_SECRETS.has(secret.toLowerCase())) {
    throw new Error(
      'AUTH_SECRET is set to a known placeholder value. Replace it with a random ' +
        'secret. Generate one with: openssl rand -hex 32'
    );
  }

  return secret;
}
`;
}

/** Names of the variables `oauthProviders()` reads, in the order they are written. */
export const OAUTH_ENV_NAMES = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const;

/**
 * The authentication entries of `.env` (no leading or trailing blank line).
 * No comment line may contain an equals sign: `.env.example` is made from this
 * text by blanking everything after the first one on each line.
 */
export function authEnvLines(secret: string): string {
  return [
    '# Secret that signs sessions. Required: the app refuses to start without it.',
    '# Use a different value in every environment. Generate one with: openssl rand -hex 32',
    `AUTH_SECRET=${secret}`,
    '',
    '# The URL the app is reached at. Requests that carry the session cookie are',
    '# accepted from this origin only, and OAuth callback URLs are built from it.',
    '# Keep it in step with PORT.',
    'BASE_URL=http://localhost:3000',
    '',
    '# OAuth sign-in. A provider is switched on when both of its values are set.',
    '# Callback URL to register with the provider: <BASE_URL>/api/auth/callback/github',
    '# (or /google).',
    ...OAUTH_ENV_NAMES.map(name => `${name}=`),
  ].join('\n');
}

/** Environment entries of the app service in the generated docker-compose.yml. */
export function authComposeEnv(): string[] {
  return [
    'AUTH_SECRET=${AUTH_SECRET}',
    'BASE_URL=${BASE_URL:-http://localhost:3000}',
    ...OAUTH_ENV_NAMES.map(name => `${name}=\${${name}:-}`),
  ];
}

/** Entries of the welcome route's endpoint directory. */
export function authEndpointFields(): string[] {
  return [
    `signUp: '/api/auth/sign-up/email'`,
    `signIn: '/api/auth/sign-in/email'`,
    `signOut: '/api/auth/sign-out'`,
    `session: '/api/auth/get-session'`,
    `profile: '/api/profile'`,
  ];
}

/**
 * The "Authentication" section of the generated README.md. The node runtime
 * listens on localhost, so its commands can be pasted as they are; the other
 * runtimes export a handler, and their commands take the URL of the deployment.
 */
export function authReadmeSection(database: string, runtime: string): string {
  const wired = WIRED_DATABASES[database];
  const isNode = runtime === 'node';
  // How the sample commands write the app's URL, and the quote that lets a
  // shell variable through.
  const url = isNode ? 'http://localhost:3000' : '$APP_URL';
  const q = isNode ? '' : '"';
  const originHeader = isNode ? `-H 'Origin: ${url}'` : `-H "Origin: ${url}"`;

  const databaseParagraph = wired
    ? `**Database.** Better Auth keeps users, password hashes and sessions in a database, and email and password sign-in needs one. This project uses the ${wired.label} connection opened in \`src/database/index.ts\`; the tables \`user\`, \`session\`, \`account\` and \`verification\` are created in it at start-up when they are missing, so there is no migration to run. When that connection is missing at start-up, the app does not start if \`NODE_ENV\` is \`production\`. Anywhere else it starts and logs a warning, with users and sessions in the memory of the process: sign-in works, everything is gone at restart, and nothing is shared between processes.`
    : `**Database.** Better Auth keeps users, password hashes and sessions in a database, and email and password sign-in needs one. ${unwiredReason(database)}, so sign-in starts on Better Auth's in-memory store: it works, everything is gone at restart, and nothing is shared between processes (with \`NODE_ENV=production\` start-up logs a warning saying so). That is enough to try things out. Before real users sign up, pass \`database\` in \`src/middleware/auth.ts\` a \`better-sqlite3\`, \`pg\` or \`mysql2\` connection or a Drizzle, Prisma or MongoDB adapter, as the [Better Auth database guide](https://better-auth.com/docs/concepts/database) describes.${
        isNode
          ? ''
          : ` Every instance of a ${runtime} deployment is a process of its own, so do that before deploying.`
      }`;

  const rolesParagraph = wired
    ? `**Roles.** A new user has \`roles\` set to \`user\`, and a sign-up cannot set it. \`/api/admin\` answers \`403\` until the user's \`roles\` contains \`admin\` (names separated by commas or spaces). Grant it in the database, for example \`UPDATE ${wired.userTable} SET roles = 'user,admin' WHERE email = 'ada@example.com';\`.`
    : `**Roles.** A new user has \`roles\` set to \`user\`, and a sign-up cannot set it. \`/api/admin\` answers \`403\` until the user's \`roles\` contains \`admin\` (names separated by commas or spaces). The in-memory store has no row to edit, so granting it starts with giving sign-in a database.`;

  return `### Authentication

Sign-in and sessions run on [Better Auth](https://better-auth.com/), set up in \`src/middleware/auth.ts\`:

| Request | What it does |
| --- | --- |
| \`POST /api/auth/sign-up/email\` | Creates a user from \`{ "name", "email", "password" }\` (a password of 8 characters or more) and signs it in |
| \`POST /api/auth/sign-in/email\` | Signs in with \`{ "email", "password" }\` |
| \`GET /api/auth/get-session\` | The session and its user, or \`null\` |
| \`POST /api/auth/sign-out\` | Ends the session |
| \`GET /api/profile\` | The signed-in user; \`401\` without a session |
| \`GET /api/admin\` | Needs the \`admin\` role: \`401\` without a session, \`403\` without the role |

\`\`\`bash
${isNode ? '' : `# The URL the deployment answers at\nAPP_URL=https://your-app.example.com\n\n`}# Create a user; the session cookie is kept in cookies.txt
curl -c cookies.txt -H 'Content-Type: application/json' ${q}${url}/api/auth/sign-up/email${q} \\
  -d '{"name":"Ada","email":"ada@example.com","password":"correct horse battery staple"}'

# A guarded route, with and without the session
curl -b cookies.txt ${q}${url}/api/profile${q}
curl -i ${q}${url}/api/profile${q}

# Sign out
curl -b cookies.txt -X POST ${originHeader} ${q}${url}/api/auth/sign-out${q}

# Sign in again
curl -c cookies.txt -H 'Content-Type: application/json' ${q}${url}/api/auth/sign-in/email${q} \\
  -d '{"email":"ada@example.com","password":"correct horse battery staple"}'
\`\`\`

Sign-up and sign-in set the session cookie and answer with a \`token\`. A client that keeps no cookies sends that token as \`Authorization: Bearer <token>\` instead. A request that changes something and carries the session cookie has to come from the app's own origin: browsers send the \`Origin\` header themselves, \`curl\` needs it as above.

${databaseParagraph}

${rolesParagraph}

**Environment.**

- \`AUTH_SECRET\` signs sessions. The scaffold wrote a random value to \`.env\` for local development; set a different one in every deployed environment (\`openssl rand -hex 32\`). The app refuses to start when it is missing or still a placeholder.
- \`BASE_URL\` is the URL the app is reached at (\`http://localhost:3000\` in \`.env\`). Requests that carry the session cookie are accepted from its origin only, and OAuth callback URLs are built from it, so ${
    isNode
      ? 'change it together with `PORT` and set the public URL in every deployed environment'
      : 'set it to the URL of the deployment'
  }.
- \`GITHUB_CLIENT_ID\` / \`GITHUB_CLIENT_SECRET\` and \`GOOGLE_CLIENT_ID\` / \`GOOGLE_CLIENT_SECRET\` switch on OAuth sign-in for that provider when both are set: \`GET /api/auth/signin/github\` (or \`/google\`) then sends the browser to the provider. Register \`<BASE_URL>/api/auth/callback/github\` (or \`/google\`) as the callback URL of the OAuth app.
`;
}

/** Lines of the generated README's endpoint list. */
export function authReadmeEndpoints(): string {
  return [
    '- **Sign up / sign in**: `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`',
    '- **Session / sign out**: `GET /api/auth/get-session`, `POST /api/auth/sign-out`',
    '- **Profile** (signed in): `GET /api/profile`',
    '- **Admin** (admin role): `GET /api/admin`',
  ].join('\n');
}

const MIDDLEWARE_DATABASE_COMMENT = commentBlock([
  'The database. Better Auth keeps users, password hashes and sessions in a database, and ' +
    "email and password sign-in needs one. This file starts on Better Auth's memoryAdapter: " +
    'users and sessions live in the memory of the process. Sign-in works, everything is gone ' +
    'at restart, and nothing is shared between processes.',
  'Before real users sign up, give `database` below a better-sqlite3, pg or mysql2 connection ' +
    'or a Drizzle, Prisma or MongoDB adapter, and create its tables: ' +
    'https://better-auth.com/docs/concepts/database',
]);

export interface AuthMiddlewareSourceOptions {
  /** TypeScript expression for the signing secret. */
  secret: string;
  /** Session lifetime in seconds. */
  maxAge: number;
  /** Extra `key: value` option lines (already indented), or an empty string. */
  extraOptions: string;
}

/**
 * Source of `src/middleware/auth_middleware.ts`, written by
 * `middleware add auth` into an existing project. It knows nothing about that
 * project's database, so it starts on Better Auth's in-memory store and says
 * what to pass instead.
 */
export function authMiddlewareSource(options: AuthMiddlewareSourceOptions): string {
  return `// Authentication Middleware Setup
//
// Sign-in and sessions on Better Auth (the "better-auth" package):
//   - email and password: POST /api/auth/sign-up/email, POST /api/auth/sign-in/email
//   - the session:        GET /api/auth/get-session, POST /api/auth/sign-out
//   - OAuth:              GET /api/auth/signin/github and /google, once the
//                         provider's client id and secret are in the environment
// A Bearer JWT signed with the secret below is verified as well when the
// "jsonwebtoken" package is installed.
//
${MIDDLEWARE_DATABASE_COMMENT}
import { auth, providers } from '@morojs/moro';
import type { AuthProvider } from '@morojs/moro';
import { memoryAdapter } from 'better-auth/adapters/memory';

${OAUTH_PROVIDERS_FUNCTION}

export const authMiddleware = auth({
  // Signing secret. Set JWT_SECRET in the environment (openssl rand -hex 32).
  secret: ${options.secret},
  providers: oauthProviders(),
  session: {
    maxAge: ${options.maxAge} // seconds
  },
  // Options handed to Better Auth as they are.
  betterAuth: {
    database: ${MEMORY_ADAPTER},
    emailAndPassword: { enabled: true }
  }${options.extraOptions ? `,\n${options.extraOptions}` : ''}
});

// Usage in your app:
// await app.use(authMiddleware);
//
// Every request then carries req.auth (isAuthenticated, user, session).
// Protect a route with a guard from '@morojs/moro':
// app.get('/me').before(requireAuth()).handler(req => req.auth.user);`;
}
