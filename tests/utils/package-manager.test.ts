import {
  detectPackageManager,
  commandsFor,
  PACKAGE_MANAGERS,
} from '../../src/utils/package-manager';

describe('utils/package-manager', () => {
  const originalUA = process.env.npm_config_user_agent;

  afterEach(() => {
    if (originalUA === undefined) delete process.env.npm_config_user_agent;
    else process.env.npm_config_user_agent = originalUA;
  });

  describe('detectPackageManager', () => {
    test('falls back to npm when env is empty', () => {
      delete process.env.npm_config_user_agent;
      expect(detectPackageManager()).toBe('npm');
    });

    test.each(PACKAGE_MANAGERS)('detects %s from user agent', pm => {
      process.env.npm_config_user_agent = `${pm}/1.0.0 node/v20.0.0 darwin arm64`;
      expect(detectPackageManager()).toBe(pm);
    });

    test('falls back to npm for unknown managers', () => {
      process.env.npm_config_user_agent = 'somepm/1.0.0 node/v20.0.0';
      expect(detectPackageManager()).toBe('npm');
    });
  });

  describe('commandsFor', () => {
    test('npm', () => {
      const c = commandsFor('npm');
      expect(c.install).toBe('npm install');
      expect(c.run('dev')).toBe('npm run dev');
      expect(c.exec('foo')).toBe('npx foo');
      expect(c.installPackage('zod', true)).toBe('npm install --save-dev zod');
    });

    test('yarn', () => {
      const c = commandsFor('yarn');
      expect(c.install).toBe('yarn install');
      expect(c.run('build')).toBe('yarn build');
      expect(c.exec('tsc')).toBe('yarn dlx tsc');
      expect(c.installPackage('zod', true)).toBe('yarn add --dev zod');
    });

    test('pnpm', () => {
      const c = commandsFor('pnpm');
      expect(c.install).toBe('pnpm install');
      expect(c.run('test')).toBe('pnpm test');
      expect(c.exec('eslint')).toBe('pnpm dlx eslint');
      expect(c.installPackage('zod')).toBe('pnpm add zod');
    });
  });
});
