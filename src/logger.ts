// Simple logger for CLI - No framework dependencies
import { createLogger, format, transports } from 'winston';

export type CliLogLevel = 'debug' | 'info' | 'warn' | 'error';

// One level for every logger the CLI creates. Loggers are created when their
// modules load, before the global flags are parsed, so the level is read on
// each call instead of being fixed at creation time.
let currentLevel: CliLogLevel = 'info';

/** Sets the level for all CLI loggers: `--verbose` selects debug, `--quiet` error. */
export function setCliLogLevel(level: CliLogLevel): void {
  currentLevel = level;
}

export function getCliLogLevel(): CliLogLevel {
  return currentLevel;
}

/** True under `--quiet`: only errors are printed, banners and spinners are skipped. */
export function isQuiet(): boolean {
  return currentLevel === 'error';
}

export function createFrameworkLogger(component: string) {
  const logger = createLogger({
    level: currentLevel,
    format: format.combine(
      format.timestamp(),
      format.colorize(),
      format.printf(({ timestamp, level, message, component: comp }) => {
        return `${timestamp} [${comp || component}] ${level}: ${message}`;
      })
    ),
    transports: [new transports.Console()],
  });

  const log = (level: CliLogLevel, message: string, comp?: string) => {
    logger.level = currentLevel;
    logger.log(level, message, { component: comp });
  };

  return {
    info: (message: string, comp?: string) => log('info', message, comp),
    error: (message: string, comp?: string) => log('error', message, comp),
    warn: (message: string, comp?: string) => log('warn', message, comp),
    debug: (message: string, comp?: string) => log('debug', message, comp),
  };
}
