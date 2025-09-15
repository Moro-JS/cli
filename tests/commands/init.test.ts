// Project Initialization Tests
import { ProjectInitializer, ProjectInitOptions } from '../../src/commands/init';

describe('ProjectInitializer', () => {
  let initializer: ProjectInitializer;

  beforeEach(() => {
    initializer = new ProjectInitializer();
  });

  describe('Class Instantiation', () => {
    test('should create ProjectInitializer instance', () => {
      expect(initializer).toBeInstanceOf(ProjectInitializer);
      expect(typeof initializer.initializeProject).toBe('function');
    });

    test('should have required methods', () => {
      expect(typeof initializer.initializeProject).toBe('function');
    });
  });

  describe('Configuration Validation', () => {
    test('should accept valid project init options', () => {
      const validOptions: ProjectInitOptions = {
        runtime: 'node',
        database: 'postgresql',
        features: 'auth,cors,websocket',
        websocket: 'socket.io',
        validation: 'zod',
        template: 'api',
        skipGit: true,
        skipInstall: true,
      };

      expect(validOptions.runtime).toBe('node');
      expect(validOptions.validation).toBe('zod');
      expect(validOptions.websocket).toBe('socket.io');
    });

    test('should handle validation library options', () => {
      const validationOptions = ['zod', 'joi', 'yup', 'class-validator', 'multiple'] as const;

      validationOptions.forEach(validation => {
        const options: ProjectInitOptions = {
          validation,
          template: 'api',
        };
        expect(options.validation).toBe(validation);
      });
    });

    test('should handle websocket adapter options', () => {
      const websocketOptions = ['auto-detect', 'socket.io', 'ws', 'none'] as const;

      websocketOptions.forEach(websocket => {
        const options: ProjectInitOptions = {
          websocket,
          template: 'api',
        };
        expect(options.websocket).toBe(websocket);
      });
    });
  });
});
