// Utility Validation Tests
describe('CLI Utilities', () => {
  describe('Project Name Validation', () => {
    test('should validate valid project names', () => {
      const validNames = [
        'my-project',
        'my_project',
        'MyProject',
        'project123',
        'project-name-with-dashes',
      ];

      validNames.forEach(name => {
        expect(isValidProjectName(name)).toBe(true);
      });
    });

    test('should reject invalid project names', () => {
      const invalidNames = [
        'my project', // spaces
        'project!', // special characters
        '123project', // starts with number
        '', // empty
        'a', // too short
        'a'.repeat(215), // too long
      ];

      invalidNames.forEach(name => {
        expect(isValidProjectName(name)).toBe(false);
      });
    });
  });

  describe('Feature Validation', () => {
    test('should validate feature combinations', () => {
      expect(isValidFeatureCombination(['auth', 'cors'])).toBe(true);
      expect(isValidFeatureCombination(['websocket', 'docs'])).toBe(true);
      expect(isValidFeatureCombination([])).toBe(true);
    });

    test('should handle unknown features gracefully', () => {
      expect(isValidFeatureCombination(['unknown-feature'])).toBe(true); // Should be permissive
    });
  });

  describe('Dependency Version Validation', () => {
    test('should validate semver versions', () => {
      expect(isValidSemver('1.0.0')).toBe(true);
      expect(isValidSemver('^1.0.0')).toBe(true);
      expect(isValidSemver('~1.0.0')).toBe(true);
      expect(isValidSemver('>=1.0.0')).toBe(true);
    });

    test('should reject invalid semver versions', () => {
      expect(isValidSemver('1.0')).toBe(false);
      expect(isValidSemver('invalid')).toBe(false);
      expect(isValidSemver('')).toBe(false);
    });
  });
});

// Mock utility functions for testing
function isValidProjectName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 214) {
    return false;
  }

  // Check for spaces and special characters
  if (/\s/.test(name) || /[!@#$%^&*()+={}[\]|\\:";'<>?,./]/.test(name)) {
    return false;
  }

  // Check if starts with number
  if (/^\d/.test(name)) {
    return false;
  }

  // Basic npm package name validation - only letters, numbers, hyphens, underscores
  const validPattern = /^[a-zA-Z]([a-zA-Z0-9\-_])*$/;
  return validPattern.test(name);
}

function isValidFeatureCombination(features: string[]): boolean {
  // For now, all combinations are valid
  return Array.isArray(features);
}

function isValidSemver(version: string): boolean {
  const semverPattern = /^([\^~>=<]*)(\d+\.\d+\.\d+)(.*)$/;
  return semverPattern.test(version);
}
