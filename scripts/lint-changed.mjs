import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(scriptDir, '..');
const eslintBinName = process.platform === 'win32' ? 'eslint.cmd' : 'eslint';
const eslintBin = [
  resolve(clientRoot, 'node_modules/.bin', eslintBinName),
  resolve(clientRoot, '../node_modules/.bin', eslintBinName),
].find((candidate) => existsSync(candidate));

if (!eslintBin) {
  throw new Error('Local ESLint binary was not found. Run npm install before linting.');
}

function git(args) {
  const result = spawnSync('git', args, { cwd: clientRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || `git ${args.join(' ')} failed`;
    throw new Error(message);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const tracked = git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD', '--', 'src']);
const untracked = git(['ls-files', '--others', '--exclude-standard', '--', 'src']);
const files = [...new Set([...tracked, ...untracked])]
  .filter((file) => /\.(?:ts|tsx)$/.test(file) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file));

if (files.length === 0) {
  console.log('No changed source files to lint.');
  process.exit(0);
}

const result = spawnSync(eslintBin, [
  '--cache',
  '--cache-location',
  'node_modules/.cache/eslint-changed/',
  ...files,
], { cwd: clientRoot, stdio: 'inherit' });
process.exit(result.status ?? 1);
