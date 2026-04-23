import { buildEquivalentCommand, ResolvedConfig } from '../../src/commands/init';

const baseConfig: ResolvedConfig = {
  runtime: 'node',
  database: 'none',
  template: 'api',
  validation: 'zod',
  websocket: 'auto-detect',
  websocketAdapter: 'auto-detect',
  features: [],
  packageManager: 'npm',
  fast: false,
  force: false,
  dryRun: false,
  skipGit: false,
  skipInstall: false,
};

describe('buildEquivalentCommand', () => {
  test('returns --fast when every value matches the defaults', () => {
    expect(buildEquivalentCommand('my-api', baseConfig)).toBe('npx @morojs/cli init my-api --fast');
  });

  test('omits flags whose value matches the default', () => {
    const cmd = buildEquivalentCommand('my-api', {
      ...baseConfig,
      database: 'postgresql',
      validation: 'zod',
    });
    expect(cmd).toBe('npx @morojs/cli init my-api --database=postgresql');
  });

  test('emits --websocket only when websocket feature is selected', () => {
    const cmd = buildEquivalentCommand('my-api', {
      ...baseConfig,
      features: ['websocket'],
      websocket: 'socket.io',
      websocketAdapter: 'socket.io',
    });
    expect(cmd).toContain('--websocket=socket.io');
    expect(cmd).toContain('--features=websocket');
  });

  test('emits --package-manager when not npm', () => {
    const cmd = buildEquivalentCommand('my-api', { ...baseConfig, packageManager: 'pnpm' });
    expect(cmd).toContain('--package-manager=pnpm');
  });

  test('combines runtime override with feature list', () => {
    const cmd = buildEquivalentCommand('my-api', {
      ...baseConfig,
      runtime: 'vercel-edge',
      features: ['auth', 'cors'],
    });
    expect(cmd).toBe('npx @morojs/cli init my-api --runtime=vercel-edge --features=auth,cors');
  });
});
