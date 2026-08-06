import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(scriptDir, '..');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const args = new Set(process.argv.slice(2));
const packageJson = JSON.parse(readFileSync(resolve(clientRoot, 'package.json'), 'utf8'));
const nativeDependencies = packageJson.nativeDependencies || {};

const groups = {
  desktop: ['electron', 'electron-builder'],
  android: ['@capacitor/android', '@capacitor/cli'],
};

const selectedGroups = [];
if (args.has('--desktop')) selectedGroups.push('desktop');
if (args.has('--android')) selectedGroups.push('android');
if (selectedGroups.length === 0 || args.has('--all')) selectedGroups.push('desktop', 'android');

const packageSpecs = [
  ...new Set(
    selectedGroups.flatMap((group) =>
      groups[group].map((name) => {
        const version = nativeDependencies[name];
        if (!version) {
          throw new Error(`缺少 nativeDependencies.${name}，无法安装原生打包依赖。`);
        }
        return `${name}@${version}`;
      }),
    ),
  ),
];

if (packageSpecs.length === 0) {
  process.exit(0);
}

console.log(`[native-deps] Installing ${packageSpecs.join(', ')}`);

const result = spawnSync(npmCommand, ['install', '--no-save', ...packageSpecs], {
  cwd: clientRoot,
  shell: isWindows,
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
