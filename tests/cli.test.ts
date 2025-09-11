// CLI Unit Tests
import { ProjectInitializer } from '../src/commands/init';
import { ModuleStubGenerator } from '../src/module-stub-generator';
import packageJson from '../package.json';

describe('@morojs/cli', () => {
  describe('Core Classes', () => {
    test('should export ProjectInitializer class', () => {
      expect(ProjectInitializer).toBeDefined();
      expect(typeof ProjectInitializer).toBe('function');
    });

    test('should create ProjectInitializer instance', () => {
      const initializer = new ProjectInitializer();
      expect(initializer).toBeInstanceOf(ProjectInitializer);
    });

    test('should export ModuleStubGenerator class', () => {
      expect(ModuleStubGenerator).toBeDefined();
      expect(typeof ModuleStubGenerator).toBe('function');
    });

    test('should create ModuleStubGenerator instance', () => {
      const generator = new ModuleStubGenerator();
      expect(generator).toBeInstanceOf(ModuleStubGenerator);
    });
  });

  describe('Package Validation', () => {
    test('should have valid semver version', () => {
      expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('should have correct package name', () => {
      expect(packageJson.name).toBe('@morojs/cli');
    });

    test('should have required dependencies', () => {
      expect(packageJson.dependencies.commander).toBeDefined();
      expect(packageJson.dependencies.inquirer).toBeDefined();
      expect(packageJson.dependencies['fs-extra']).toBeDefined();
      expect(packageJson.dependencies.chalk).toBeDefined();
      expect(packageJson.dependencies.figlet).toBeDefined();
    });

    test('should have correct bin configuration', () => {
      expect(packageJson.bin['morojs-cli']).toBe('./bin/cli.js');
      expect(packageJson.bin['moro-cli']).toBe('./bin/cli.js');
    });

    test('should have proper ES module exports', () => {
      expect(packageJson.exports['.']).toBeDefined();
      expect(packageJson.exports['.'].types).toBe('./dist/index.d.ts');
      expect(packageJson.exports['.'].import).toBe('./dist/index.js');
    });
  });
});
