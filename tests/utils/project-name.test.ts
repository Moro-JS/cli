import { validateProjectName, assertValidProjectName } from '../../src/utils/project-name';

describe('utils/project-name', () => {
  describe('validateProjectName', () => {
    test.each(['my-api', 'my_api', 'project123', '@scope/my-api'])('accepts %s', name => {
      expect(validateProjectName(name).valid).toBe(true);
    });

    test.each(['My API', 'My!Project', '../bad', ''])('rejects %s', name => {
      expect(validateProjectName(name).valid).toBe(false);
    });
  });

  describe('assertValidProjectName', () => {
    test('does not throw for valid names', () => {
      expect(() => assertValidProjectName('my-api')).not.toThrow();
    });

    test('throws a friendly error for invalid names', () => {
      expect(() => assertValidProjectName('Bad Name!')).toThrow(/not a valid project name/);
    });
  });
});
