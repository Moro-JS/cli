// CLI Command Integration Tests
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

describe('CLI Commands Integration', () => {
  let testDir: string;
  const cliPath = join(__dirname, '../../bin/cli.js');

  beforeEach(async () => {
    testDir = join(tmpdir(), `moro-cli-integration-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('CLI Help and Version', () => {
    test('should display help message', async () => {
      const { stdout } = await execAsync(`node "${cliPath}" --help`);
      expect(stdout).toContain('MoroJS Framework');
      expect(stdout).toContain('init');
      expect(stdout).toContain('module');
      expect(stdout).toContain('config');
    });

    test('should display version', async () => {
      const { stdout } = await execAsync(`node "${cliPath}" --version`);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('should display examples', async () => {
      const { stdout } = await execAsync(`node "${cliPath}" examples`);
      expect(stdout).toContain('MoroJS CLI Examples');
      expect(stdout).toContain('Project Initialization');
      expect(stdout).toContain('--validation');
      expect(stdout).toContain('--websocket');
    });
  });

  describe('Init Command', () => {
    test('should create project with all CLI options specified', async () => {
      const projectName = 'test-cli-project';
      const projectPath = join(testDir, projectName);

      const { stdout, stderr } = await execAsync(
        `cd "${testDir}" && node "${cliPath}" init ${projectName} --runtime=node --database=postgresql --template=api --features=auth,cors --websocket=none --validation=zod --skip-git --skip-install`,
        { timeout: 30000 }
      );

      // CLI may output progress to stderr, that's fine
      expect(stdout || stderr).toContain('created successfully');

      // Verify project structure
      expect(await fileExists(join(projectPath, 'package.json'))).toBe(true);
      expect(await fileExists(join(projectPath, 'src/index.ts'))).toBe(true);
      expect(await fileExists(join(projectPath, 'src/routes/index.ts'))).toBe(true);
      expect(await fileExists(join(projectPath, 'tsconfig.json'))).toBe(true);

      // Verify package.json content
      const packageJson = JSON.parse(await fs.readFile(join(projectPath, 'package.json'), 'utf8'));
      expect(packageJson.name).toBe(projectName);
      expect(packageJson.dependencies.zod).toBeDefined();
      expect(packageJson.dependencies.pg).toBeDefined(); // postgresql
      expect(packageJson.dependencies['better-auth']).toBeDefined(); // auth
    });

    test('should create project with WebSocket features', async () => {
      const projectName = 'test-websocket-project';
      const projectPath = join(testDir, projectName);

      const { stdout, stderr } = await execAsync(
        `cd "${testDir}" && node "${cliPath}" init ${projectName} --runtime=node --database=sqlite --template=api --features=websocket --websocket=socket.io --validation=joi --skip-git --skip-install`,
        { timeout: 30000 }
      );

      // CLI may output progress to stderr, that's fine
      expect(stdout || stderr).toContain('created successfully');

      // Verify WebSocket dependencies
      const packageJson = JSON.parse(await fs.readFile(join(projectPath, 'package.json'), 'utf8'));
      expect(packageJson.dependencies['socket.io']).toBeDefined();
      expect(packageJson.dependencies.joi).toBeDefined();

      // Verify file structure
      expect(await fileExists(join(projectPath, 'src/websockets/index.ts'))).toBe(true);
      expect(await fileExists(join(projectPath, 'src/validation/examples.ts'))).toBe(true);
    });
  });

  describe('Module Command', () => {
    test('should display module help', async () => {
      const { stdout } = await execAsync(`node "${cliPath}" module --help`);
      expect(stdout).toContain('Module management commands');
      expect(stdout).toContain('create');
      expect(stdout).toContain('list');
    });

    test('should show create module help', async () => {
      const { stdout } = await execAsync(`node "${cliPath}" module create --help`);
      expect(stdout).toContain('Create a new module');
      expect(stdout).toContain('--features');
      expect(stdout).toContain('--database');
    });
  });

  describe('Config Command', () => {
    test('should display config help', async () => {
      const { stdout } = await execAsync(`node "${cliPath}" config --help`);
      expect(stdout).toContain('Configuration management');
      expect(stdout).toContain('init');
      expect(stdout).toContain('validate');
    });
  });

  describe('Global --quiet / --verbose', () => {
    test('--quiet suppresses informational output', async () => {
      const normal = await execAsync(`cd "${testDir}" && node "${cliPath}" module list`);
      expect(normal.stdout).toContain('No modules directory found');

      const quiet = await execAsync(`cd "${testDir}" && node "${cliPath}" --quiet module list`);
      expect(quiet.stdout.trim()).toBe('');
    });

    test('--quiet init writes the project without the banner or success box', async () => {
      const { stdout } = await execAsync(
        `cd "${testDir}" && node "${cliPath}" --quiet init quiet-app --fast --skip-git --skip-install`,
        { timeout: 30000 }
      );

      expect(stdout.trim()).toBe('');
      expect(await fileExists(join(testDir, 'quiet-app', 'package.json'))).toBe(true);
    });

    test('--verbose adds debug output', async () => {
      const normal = await execAsync(
        `cd "${testDir}" && node "${cliPath}" init plain-app --fast --skip-git --skip-install`,
        { timeout: 30000 }
      );
      expect(normal.stdout).not.toContain('debug');

      const verbose = await execAsync(
        `cd "${testDir}" && node "${cliPath}" --verbose init verbose-app --fast --skip-git --skip-install`,
        { timeout: 30000 }
      );
      expect(verbose.stdout).toContain('debug');
      expect(verbose.stdout).toContain('Wrote verbose-app/package.json');
    });
  });

  describe('Database Command', () => {
    test('db migrate exits 0 and says that no migration was run', async () => {
      await fs.mkdir(join(testDir, 'src', 'database', 'migrations'), { recursive: true });

      const { stdout } = await execAsync(`cd "${testDir}" && node "${cliPath}" db migrate --up`);

      expect(stdout).toContain('No migration was run');
      expect(stdout).not.toContain('completed successfully');
    });
  });

  describe('Error Handling', () => {
    test('should handle unknown commands', async () => {
      const result = await execAsync(`node "${cliPath}" unknown-command`).catch(error => error);
      expect(result.code).toBe(1);
      expect(result.stderr || result.stdout).toContain('unknown command');
    });

    test('should handle invalid options', async () => {
      const result = await execAsync(`node "${cliPath}" init --invalid-option`).catch(
        error => error
      );
      expect(result.code).toBe(1);
    });
  });
});

// Helper functions
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
