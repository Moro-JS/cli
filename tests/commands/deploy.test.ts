// deploy vercel|lambda|workers – the generated configuration and scripts.
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DeploymentManager } from '../../src/commands/deploy';

describe('DeploymentManager', () => {
  let workDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workDir = await fs.mkdtemp(join(tmpdir(), 'moro-deploy-'));
    process.chdir(workDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(workDir, { recursive: true, force: true });
  });

  const read = (file: string) => fs.readFile(join(workDir, file), 'utf8');
  const isExecutable = async (file: string) =>
    ((await fs.stat(join(workDir, file))).mode & 0o111) === 0o111;

  test('every generated deploy script can be run as ./deploy-*.sh', async () => {
    const manager = new DeploymentManager();
    await manager.setupVercel({});
    await manager.setupLambda({});
    await manager.setupCloudflareWorkers({});

    expect(await isExecutable('deploy-vercel.sh')).toBe(true);
    expect(await isExecutable('deploy-lambda.sh')).toBe(true);
    expect(await isExecutable('deploy-workers.sh')).toBe(true);
  });

  test('a script that already exists without the executable bit gets it', async () => {
    await fs.writeFile(join(workDir, 'deploy-lambda.sh'), '#!/bin/bash\n', { mode: 0o644 });

    await new DeploymentManager().setupLambda({});

    expect(await isExecutable('deploy-lambda.sh')).toBe(true);
  });

  test('lambda: handler and script use the runtime file build --target lambda writes', async () => {
    await new DeploymentManager().setupLambda({ region: 'eu-west-1' });

    const config = await read('serverless.yml');
    expect(config).toContain('handler: dist/runtime.handler');
    expect(config).not.toContain('handler: dist/index.handler');

    const script = await read('deploy-lambda.sh');
    expect(script).toContain('npx @morojs/cli build --target=lambda');
    expect(script).toContain('serverless deploy --region eu-west-1');
  });

  test('workers: main and script use the runtime file build --target workers writes', async () => {
    await new DeploymentManager().setupCloudflareWorkers({ name: 'edge-api' });

    const config = await read('wrangler.toml');
    expect(config).toContain('main = "dist/runtime.js"');
    expect(config).toContain('name = "edge-api"');

    const script = await read('deploy-workers.sh');
    expect(script).toContain('npx @morojs/cli build --target=workers');
    // `wrangler publish` no longer exists; the command is `wrangler deploy`.
    expect(script).toMatch(/^wrangler deploy$/m);
    expect(script).not.toMatch(/^wrangler publish/m);
  });
});
