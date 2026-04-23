// Project name validation – wraps `validate-npm-package-name` so we get
// npm-compatible directory/package names and friendly errors.
import validate from 'validate-npm-package-name';

export interface ProjectNameValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateProjectName(name: string): ProjectNameValidation {
  const result = validate(name);
  return {
    valid: result.validForNewPackages,
    errors: result.errors ?? [],
    warnings: result.warnings ?? [],
  };
}

/**
 * Throws a friendly Error if the name isn't a valid npm package name.
 * Warnings are returned (not thrown) so the caller can log them if desired.
 */
export function assertValidProjectName(name: string): { warnings: string[] } {
  const { valid, errors, warnings } = validateProjectName(name);
  if (!valid) {
    const reasons = errors.length > 0 ? errors.join('; ') : warnings.join('; ');
    throw new Error(
      `"${name}" is not a valid project name (must be a valid npm package name).\n` +
        `Reason: ${reasons}\n` +
        `Tip: use lowercase letters, numbers and dashes (e.g. "my-api").`
    );
  }
  return { warnings };
}
