// Simple logger for CLI - No framework dependencies
import { createLogger, format, transports } from 'winston';

export function createFrameworkLogger(component: string) {
  const logger = createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp(),
      format.colorize(),
      format.printf(({ timestamp, level, message, component: comp }) => {
        return `${timestamp} [${comp || component}] ${level}: ${message}`;
      })
    ),
    transports: [new transports.Console()],
  });

  return {
    info: (message: string, comp?: string) => logger.info(message, { component: comp }),
    error: (message: string, comp?: string) => logger.error(message, { component: comp }),
    warn: (message: string, comp?: string) => logger.warn(message, { component: comp }),
    debug: (message: string, comp?: string) => logger.debug(message, { component: comp }),
  };
}
