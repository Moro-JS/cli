# Contributing to @morojs/cli

Thank you for your interest in contributing to the MoroJS CLI! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Getting Started

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/cli.git
   cd cli
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Test the CLI**
   ```bash
   node dist/cli.js --help
   ```

## Development Workflow

### Making Changes

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**

   ```bash
   npm run lint
   npm run format
   npm test
   npm run build
   ```

4. **Test CLI functionality**

   ```bash
   # Test basic commands
   node dist/cli.js --help
   node dist/cli.js examples
   node dist/cli.js middleware list

   # Test module generation
   mkdir /tmp/test-cli && cd /tmp/test-cli
   node /path/to/cli/dist/cli.js generate test-module --features=websocket,database
   ```

### Code Style

- **ESLint**: We use ESLint with TypeScript rules
- **Prettier**: Code formatting is handled by Prettier
- **Functional emojis only**: Keep ✅ ❌ ⚠️ for status, remove decorative ones
- **TypeScript**: All code should be properly typed

### Commit Messages

Use conventional commit format:

```
feat: add new database adapter support
fix: resolve module generation path issue
docs: update README with new examples
chore: update dependencies
```

## Project Structure

```
@morojs/cli/
├── src/
│   ├── cli.ts                    # Main CLI entry point
│   ├── module-stub-generator.ts  # Legacy module generator
│   ├── commands/                 # Command implementations
│   │   ├── init.ts              # Project initialization
│   │   ├── config.ts            # Configuration management
│   │   ├── database.ts          # Database commands
│   │   ├── deploy.ts            # Deployment commands
│   │   ├── dev.ts               # Development tools
│   │   └── middleware.ts        # Middleware management
│   ├── utils/                   # Utility functions
│   └── logger.ts               # Logging utilities
├── bin/
│   └── cli.js                  # Executable entry point
├── .github/                    # GitHub workflows and templates
├── tests/                      # Test files
└── dist/                       # Built output
```

## Adding New Features

### Adding a New Command

1. Create a new file in `src/commands/`
2. Export a class with the command logic
3. Add the command to `src/cli.ts`
4. Add tests in `tests/`
5. Update documentation

### Adding Database Support

1. Add the adapter type to the database manager
2. Create configuration templates
3. Add migration/seed support if applicable
4. Test with a real database instance

### Adding Runtime Support

1. Add runtime type to deployment manager
2. Create deployment configuration templates
3. Add runtime-specific build logic
4. Test deployment process

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Manual CLI Testing

```bash
# Build and test locally
npm run build
node dist/cli.js --help

# Test in a clean directory
mkdir /tmp/cli-test && cd /tmp/cli-test
node /path/to/cli/dist/cli.js init test-project --runtime=node --database=postgresql
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new functions
- Update examples in the CLI help text
- Add entries to the examples command

## Pull Request Process

1. **Create a descriptive PR title and description**
2. **Link any related issues**
3. **Ensure all checks pass**
   - Linting
   - Tests
   - Build
   - Security audit
4. **Request review from maintainers**
5. **Address feedback promptly**

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Tests added/updated for changes
- [ ] Documentation updated
- [ ] No breaking changes (or clearly documented)
- [ ] CLI commands tested manually
- [ ] Commit messages follow conventional format

## Release Process

Releases are automated through GitHub Actions:

1. **Create a release** on GitHub with semantic version tag
2. **CI/CD pipeline** runs all tests and builds
3. **Automatic publication** to npm with `--access public`

## Getting Help

- **Documentation**: [MoroJS Docs](https://morojs.com)
- **Issues**: [GitHub Issues](https://github.com/Moro-JS/cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Moro-JS/cli/discussions)
- **Discord**: [MoroJS Community](https://discord.gg/morojs)

## Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

---

**Built with ❤️ by the MoroJS Community**
