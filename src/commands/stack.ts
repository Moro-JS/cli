// Stack commands — thin delegation to `@morojs/stacks/cli` (the pre-wired
// application stacks). The heavy lifting (catalog, scaffold, eject) lives in the
// `@morojs/stacks` package; this just surfaces it through the MoroJS CLI.
//
// `@morojs/stacks` is an OPTIONAL peer of the CLI and is ESM, so it's loaded via a
// true dynamic import (the `Function` indirection keeps it a real `import()` even
// though this file compiles to CommonJS). A friendly hint is shown if it's absent.
import { createFrameworkLogger } from '../logger';

// Bypass TS's CommonJS transpilation of import() so we get a native ESM import.
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<any>;

async function loadStacksCli(): Promise<any> {
  try {
    return await dynamicImport('@morojs/stacks/cli');
  } catch {
    throw new Error(
      'Stack commands require the @morojs/stacks package.\n' +
        'Install it with: npm install @morojs/stacks'
    );
  }
}

export interface StackNewOptions {
  stack?: string;
  runtime?: string;
  database?: string;
  packageManager?: string;
  force?: boolean;
  link?: boolean;
}

export interface StackEjectOptions {
  dir?: string;
  force?: boolean;
}

export class StackCommands {
  private logger = createFrameworkLogger('Stack');

  async list(): Promise<void> {
    const cli = await loadStacksCli();
    console.log(cli.formatStackList());
  }

  async describe(name: string): Promise<void> {
    const cli = await loadStacksCli();
    console.log(cli.formatStackDescription(name));
  }

  async create(projectName: string, options: StackNewOptions): Promise<void> {
    if (!options.stack) {
      throw new Error('Missing --stack <stack>. Run `morojs-cli stack list` to see options.');
    }
    const cli = await loadStacksCli();
    const outcome = await cli.scaffoldStack({
      projectName,
      stack: options.stack,
      runtime: options.runtime,
      database: options.database,
      packageManager: options.packageManager,
      force: Boolean(options.force),
      link: Boolean(options.link),
    });

    const pm = options.packageManager || 'npm';
    this.logger.info(`Scaffolded "${outcome.stack}" stack into ${outcome.projectDir}`);
    console.log('\nNext steps:');
    console.log(`  cd ${projectName === '.' ? '.' : projectName}`);
    console.log(`  ${pm} install`);
    console.log(`  ${pm} run dev\n`);
    if (outcome.postInstallNotes?.length) {
      console.log('Notes:');
      for (const note of outcome.postInstallNotes) console.log(`  • ${note}`);
      console.log('');
    }
  }

  async modules(): Promise<void> {
    const cli = await loadStacksCli();
    console.log(cli.formatModuleList());
  }

  async add(name: string, options: { dir?: string; force?: boolean }): Promise<void> {
    const cli = await loadStacksCli();
    const outcome = await cli.addModule({
      module: name,
      projectDir: options.dir,
      force: Boolean(options.force),
    });
    this.logger.info(`Added "${name}" module`);
    for (const file of outcome.written) console.log(`  • ${file}`);
    if (outcome.wired) console.log('  • src/index.ts (wired)');
    if (Object.keys(outcome.dependencies).length) {
      console.log(
        `\nNew dependencies: ${Object.keys(outcome.dependencies).join(', ')} — run install.`
      );
    }
    console.log('');
    for (const note of outcome.notes) console.log(`  ${note}`);
    console.log('');
  }

  async eject(name: string, options: StackEjectOptions): Promise<void> {
    const cli = await loadStacksCli();
    const outcome = await cli.ejectStack({
      stack: name,
      projectDir: options.dir,
      force: Boolean(options.force),
    });
    this.logger.info(`Ejected "${name}" into your project`);
    for (const file of outcome.written) console.log(`  • ${file}`);
    if (outcome.rewiredEntry) console.log(`  • ${outcome.rewiredEntry} (import rewired)`);
    console.log('');
    for (const note of outcome.notes) console.log(`  ${note}`);
    console.log('');
  }
}
