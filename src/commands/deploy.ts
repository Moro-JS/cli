// Deployment Management - Setup runtime-specific deployments
import { writeFile, chmod } from 'fs/promises';
import { join } from 'path';
import { createFrameworkLogger } from '../logger';

/**
 * Writes a deployment script and marks it executable, so the printed
 * "./deploy-*.sh" step works as shown.
 */
async function writeExecutableScript(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o755 });
  // The mode option only applies when the file is created; an existing script
  // keeps its old mode, so set it explicitly.
  await chmod(path, 0o755);
}

export interface VercelOptions {
  domain?: string;
}

export interface LambdaOptions {
  region?: string;
  memory?: string;
  timeout?: string;
}

export interface WorkersOptions {
  name?: string;
}

export class DeploymentManager {
  private logger = createFrameworkLogger('DeploymentManager');

  async setupVercel(options: VercelOptions): Promise<void> {
    this.logger.info('Setting up Vercel Edge deployment...', 'Deploy');

    try {
      // Generate vercel.json
      const vercelConfig = {
        version: 2,
        builds: [
          {
            src: 'src/index.ts',
            use: '@vercel/node',
          },
        ],
        routes: [
          {
            src: '/(.*)',
            dest: 'src/index.ts',
          },
        ],
        env: {
          NODE_ENV: 'production',
        },
        ...(options.domain && { alias: [options.domain] }),
      };

      await writeFile(join(process.cwd(), 'vercel.json'), JSON.stringify(vercelConfig, null, 2));

      // Generate deployment script
      const deployScript = `#!/bin/bash
# Vercel Deployment Script

echo "Deploying to Vercel Edge Runtime..."

# Build the project
npm run build

# Deploy with Vercel CLI
vercel --prod ${options.domain ? `--alias ${options.domain}` : ''}

echo "✅ Deployment complete!"`;

      await writeExecutableScript(join(process.cwd(), 'deploy-vercel.sh'), deployScript);

      this.logger.info('✅ Vercel deployment configuration created!', 'Deploy');
      this.logger.info('Next steps:', 'Deploy');
      this.logger.info('  1. Install Vercel CLI: npm i -g vercel', 'Deploy');
      this.logger.info('  2. Login: vercel login', 'Deploy');
      this.logger.info('  3. Deploy: ./deploy-vercel.sh', 'Deploy');
    } catch (error) {
      this.logger.error(
        `Vercel setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Deploy'
      );
      throw error;
    }
  }

  async setupLambda(options: LambdaOptions): Promise<void> {
    this.logger.info('Setting up AWS Lambda deployment...', 'Deploy');

    try {
      // Generate serverless.yml
      const serverlessConfig = `service: morojs-lambda-app

provider:
  name: aws
  runtime: nodejs20.x
  region: ${options.region || 'us-east-1'}
  memorySize: ${options.memory || '512'}
  timeout: ${options.timeout || '30'}
  environment:
    NODE_ENV: production

functions:
  api:
    # dist/runtime.js is written by "morojs-cli build --target lambda" (see
    # deploy-lambda.sh) and exports the Lambda handler of the compiled app.
    handler: dist/runtime.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
      - http:
          path: /
          method: ANY
          cors: true

plugins:
  - serverless-offline
  - serverless-plugin-typescript

package:
  exclude:
    - src/**
    - tests/**
    - '*.md'
    - .git/**`;

      await writeFile(join(process.cwd(), 'serverless.yml'), serverlessConfig);

      // Generate deployment script
      const deployScript = `#!/bin/bash
# AWS Lambda Deployment Script

echo "Deploying to AWS Lambda..."

# Compile the project and write dist/runtime.js, the Lambda entry that
# serverless.yml points at (handler: dist/runtime.handler)
npx @morojs/cli build --target=lambda

# Deploy with Serverless Framework
serverless deploy --region ${options.region || 'us-east-1'}

echo "✅ Deployment complete!"`;

      await writeExecutableScript(join(process.cwd(), 'deploy-lambda.sh'), deployScript);

      this.logger.info('✅ AWS Lambda deployment configuration created!', 'Deploy');
      this.logger.info('Next steps:', 'Deploy');
      this.logger.info('  1. Install Serverless CLI: npm i -g serverless', 'Deploy');
      this.logger.info('  2. Configure AWS credentials: aws configure', 'Deploy');
      this.logger.info('  3. Deploy: ./deploy-lambda.sh', 'Deploy');
    } catch (error) {
      this.logger.error(
        `Lambda setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Deploy'
      );
      throw error;
    }
  }

  async setupCloudflareWorkers(options: WorkersOptions): Promise<void> {
    this.logger.info('Setting up Cloudflare Workers deployment...', 'Deploy');

    try {
      // Generate wrangler.toml
      const wranglerConfig = `name = "${options.name || 'morojs-worker'}"
# dist/runtime.js is written by "morojs-cli build --target workers" (see
# deploy-workers.sh) and exports the Worker's fetch handler.
main = "dist/runtime.js"
compatibility_date = "2023-12-01"

[env.production]
name = "${options.name || 'morojs-worker'}-production"

[env.staging]
name = "${options.name || 'morojs-worker'}-staging"`;

      await writeFile(join(process.cwd(), 'wrangler.toml'), wranglerConfig);

      // Generate deployment script
      const deployScript = `#!/bin/bash
# Cloudflare Workers Deployment Script

echo "Deploying to Cloudflare Workers..."

# Compile the project and write dist/runtime.js, the Worker entry that
# wrangler.toml points at (main)
npx @morojs/cli build --target=workers

# Deploy with Wrangler ("wrangler publish" was renamed to "wrangler deploy" in v3)
wrangler deploy

echo "✅ Deployment complete!"`;

      await writeExecutableScript(join(process.cwd(), 'deploy-workers.sh'), deployScript);

      this.logger.info('✅ Cloudflare Workers deployment configuration created!', 'Deploy');
      this.logger.info('Next steps:', 'Deploy');
      this.logger.info('  1. Install Wrangler CLI: npm i -g wrangler', 'Deploy');
      this.logger.info('  2. Login: wrangler login', 'Deploy');
      this.logger.info('  3. Deploy: ./deploy-workers.sh', 'Deploy');
    } catch (error) {
      this.logger.error(
        `Workers setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Deploy'
      );
      throw error;
    }
  }
}
