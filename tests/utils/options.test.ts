import {
  validateChoice,
  validateList,
  assertMutuallyExclusive,
  suggest,
  levenshtein,
  withErrorHandling,
} from '../../src/utils/options';

describe('utils/options', () => {
  describe('levenshtein', () => {
    test('returns 0 for identical strings', () => {
      expect(levenshtein('hello', 'hello')).toBe(0);
    });

    test('returns string length when other is empty', () => {
      expect(levenshtein('abc', '')).toBe(3);
      expect(levenshtein('', 'abc')).toBe(3);
    });

    test('counts single edits', () => {
      expect(levenshtein('cat', 'cot')).toBe(1);
      expect(levenshtein('cat', 'cats')).toBe(1);
    });
  });

  describe('suggest', () => {
    test('finds the closest match within distance', () => {
      expect(suggest('nod', ['node', 'vercel-edge'])).toBe('node');
      expect(suggest('corss', ['cors', 'auth'])).toBe('cors');
    });

    test('returns null when nothing is close enough', () => {
      expect(suggest('xyzzy', ['node', 'auth'])).toBeNull();
    });
  });

  describe('validateChoice', () => {
    const allowed = ['node', 'vercel-edge'] as const;

    test('returns the value when valid', () => {
      expect(validateChoice({ name: 'runtime', value: 'node', allowed })).toBe('node');
    });

    test('returns undefined when not provided', () => {
      expect(validateChoice({ name: 'runtime', value: undefined, allowed })).toBeUndefined();
    });

    test('throws with did-you-mean for typos', () => {
      expect(() => validateChoice({ name: 'runtime', value: 'nod', allowed })).toThrow(
        /Did you mean/
      );
    });
  });

  describe('validateList', () => {
    const allowed = ['auth', 'cors', 'docs'] as const;

    test('returns parsed tokens when all valid', () => {
      expect(validateList({ name: 'features', value: 'auth,cors', allowed })).toEqual([
        'auth',
        'cors',
      ]);
    });

    test('throws listing every invalid token with hints', () => {
      expect(() => validateList({ name: 'features', value: 'auth,corss,docks', allowed })).toThrow(
        /corss.*cors.*docks.*docs/s
      );
    });

    test('handles empty string', () => {
      expect(validateList({ name: 'features', value: '', allowed })).toEqual([]);
    });
  });

  describe('assertMutuallyExclusive', () => {
    test('passes when none set', () => {
      expect(() => assertMutuallyExclusive({}, ['quiet', 'verbose'])).not.toThrow();
    });

    test('passes when only one set', () => {
      expect(() => assertMutuallyExclusive({ verbose: true }, ['quiet', 'verbose'])).not.toThrow();
    });

    test('throws when both set', () => {
      expect(() =>
        assertMutuallyExclusive({ verbose: true, quiet: true }, ['quiet', 'verbose'])
      ).toThrow(/Cannot combine/);
    });
  });

  describe('withErrorHandling', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      throw new Error('process.exit');
    }) as never);

    afterAll(() => exitSpy.mockRestore());

    test('passes through successful calls', async () => {
      let captured = 0;
      const wrapped = withErrorHandling('Test', async (n: number) => {
        captured = n;
      });
      await wrapped(7);
      expect(captured).toBe(7);
    });

    test('exits with code 1 when handler throws', async () => {
      const wrapped = withErrorHandling('Test', async () => {
        throw new Error('boom');
      });
      await expect(wrapped()).rejects.toThrow('process.exit');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
