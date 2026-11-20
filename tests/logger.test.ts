// CLI logger – the level set by --verbose / --quiet applies to every logger.
import { createFrameworkLogger, getCliLogLevel, isQuiet, setCliLogLevel } from '../src/logger';

describe('CLI logger level', () => {
  let written: string[];
  let consoleSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    written = [];
    const capture = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    // winston's Console transport writes through console._stdout / _stderr.
    stdoutSpy = jest.spyOn((console as any)._stdout, 'write').mockImplementation(capture as any);
    stderrSpy = jest.spyOn((console as any)._stderr, 'write').mockImplementation(capture as any);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(capture as any);
  });

  afterEach(() => {
    setCliLogLevel('info');
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  const output = () => written.join('');

  test('info is the default: debug lines are hidden', () => {
    const logger = createFrameworkLogger('Test');
    logger.debug('debug-line');
    logger.info('info-line');

    expect(getCliLogLevel()).toBe('info');
    expect(output()).toContain('info-line');
    expect(output()).not.toContain('debug-line');
  });

  test('verbose shows debug lines, also on loggers created before the level was set', () => {
    const logger = createFrameworkLogger('Test');
    setCliLogLevel('debug');
    logger.debug('debug-line');

    expect(output()).toContain('debug-line');
  });

  test('quiet prints errors only', () => {
    const logger = createFrameworkLogger('Test');
    setCliLogLevel('error');
    logger.info('info-line');
    logger.warn('warn-line');
    logger.error('error-line');

    expect(isQuiet()).toBe(true);
    expect(output()).toContain('error-line');
    expect(output()).not.toContain('info-line');
    expect(output()).not.toContain('warn-line');
  });
});
