// Basic CLI Tests
import { runCLI } from '../src/cli';
import { ModuleStubGenerator } from '../src/module-stub-generator';

describe('@morojs/cli', () => {
  describe('CLI Module', () => {
    test('should export runCLI function', () => {
      expect(typeof runCLI).toBe('function');
    });

    test('should export ModuleStubGenerator class', () => {
      expect(ModuleStubGenerator).toBeDefined();
      expect(typeof ModuleStubGenerator).toBe('function');
    });
  });

  describe('ModuleStubGenerator', () => {
    test('should create instance', () => {
      const generator = new ModuleStubGenerator();
      expect(generator).toBeInstanceOf(ModuleStubGenerator);
    });
  });

  describe('Version', () => {
    test('should be 1.0.0', () => {
      const packageJson = require('../package.json');
      expect(packageJson.version).toBe('1.0.0');
    });

    test('should have correct package name', () => {
      const packageJson = require('../package.json');
      expect(packageJson.name).toBe('@morojs/cli');
    });
  });
}); 