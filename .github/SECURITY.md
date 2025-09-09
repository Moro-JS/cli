# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | ✅ |

## Reporting a Vulnerability

We take the security of @morojs/cli seriously. If you discover a security vulnerability, please follow these steps:

### Private Disclosure

**DO NOT** open a public issue for security vulnerabilities.

Instead, please report security issues by:

1. **Email**: Send details to security@morojs.com
2. **GitHub Security Advisory**: Use the "Security" tab → "Report a vulnerability"

### What to Include

Please include as much of the following information as possible:

- Type of issue (e.g. code injection, command injection, path traversal, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### Response Timeline

- **Initial Response**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 1-3 days
  - High: 1-2 weeks
  - Medium: 2-4 weeks
  - Low: Next release cycle

### Recognition

We appreciate responsible disclosure and will acknowledge security researchers who report vulnerabilities to us in our security advisories (unless you prefer to remain anonymous).

## Security Best Practices

When using @morojs/cli:

1. Keep the CLI updated to the latest version
2. Be cautious when running CLI commands with elevated privileges
3. Validate generated code before using in production
4. Review generated configurations before deployment
5. Use official installation methods (npm/yarn)
6. Regular security audits with `npm audit`

## Security Features

@morojs/cli includes several security considerations:

- Input validation for CLI arguments and options
- Safe file generation practices
- Secure configuration templates
- No arbitrary code execution from user input
- Sandboxed module generation

## CLI-Specific Security Considerations

### File Generation
- All generated files are created with appropriate permissions
- No overwriting of system files
- Path traversal protection in file operations

### Command Execution
- No arbitrary command execution from user input
- Subprocess execution is limited to known safe operations
- Environment variable handling follows security best practices

### Template Security
- Generated code follows security best practices
- Database connection strings are properly parameterized
- Authentication configurations use secure defaults

For more details about MoroJS framework security, see the [MoroJS Security Documentation](https://morojs.com/docs/security). 