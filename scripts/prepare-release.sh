#!/bin/bash

# MoroJS CLI Release Preparation Script

echo "Preparing @morojs/cli for release..."

# Clean and build
echo "Cleaning previous build..."
npm run clean

echo "Installing dependencies..."
npm ci

echo "Running linter..."
npm run lint

echo "Running tests..."
npm test

echo "Building project..."
npm run build

echo "Verifying CLI functionality..."
node dist/cli.js --version
node dist/cli.js --help > /dev/null

echo "Running security audit..."
npm audit

echo "Verifying package contents..."
npm pack --dry-run

echo ""
echo "✅ Release preparation complete!"
echo ""
echo "Next steps:"
echo "1. Commit all changes: git add . && git commit -m 'chore: prepare v1.0.0 release'"
echo "2. Push to GitHub: git push origin main"
echo "3. Create GitHub release with tag v1.0.0"
echo "4. GitHub Actions will automatically publish to NPM"
echo ""
echo "Or publish manually:"
echo "  npm publish --access public" 