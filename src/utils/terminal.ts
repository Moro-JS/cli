// Terminal Command Utilities
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TerminalOptions {
  cwd?: string;
  env?: Record<string, string>;
  stdio?: 'inherit' | 'pipe';
}

export async function runTerminalCmd(
  command: string,
  options: TerminalOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const { cwd = process.cwd(), env = process.env, stdio = 'pipe' } = options;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      env: { ...env },
    });

    return { stdout, stderr };
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

export function spawnCommand(
  command: string,
  args: string[] = [],
  options: TerminalOptions = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), env = process.env, stdio = 'inherit' } = options;

    const child = spawn(command, args, {
      cwd,
      env: { ...env },
      stdio,
    });

    child.on('close', code => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}`));
      }
    });

    child.on('error', error => {
      reject(error);
    });
  });
}
