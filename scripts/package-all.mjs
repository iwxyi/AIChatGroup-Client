import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(scriptDir, '..');
const workspaceRoot = resolve(clientRoot, '..');
const androidRoot = resolve(clientRoot, 'android');
const releaseRoot = resolve(clientRoot, 'release');
const stagingRoot = resolve(releaseRoot, '.staging');
const electronAppRoot = resolve(stagingRoot, 'electron-app');
const desktopOutputRoot = resolve(stagingRoot, 'desktop');
const isWindows = process.platform === 'win32';
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipAndroid = args.has('--skip-android');
const skipDesktop = args.has('--skip-desktop');
const skipWindows = args.has('--skip-windows');
const skipLinux = args.has('--skip-linux');
const skipWebBuild = args.has('--skip-web-build');
const androidBuildType = (process.env.ANDROID_BUILD_TYPE || 'debug').toLowerCase();
const workspacePackage = JSON.parse(readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'));
const releaseVersion = process.env.RELEASE_VERSION || workspacePackage.version || '1.0.0';
const finalArtifacts = [];
const desktopTargets = { linux: false, windows: false };

if (!['debug', 'release'].includes(androidBuildType)) {
  throw new Error('ANDROID_BUILD_TYPE 只能是 debug 或 release。');
}

const npxCommand = isWindows ? 'npx.cmd' : 'npx';

function commandExists(command, env = process.env) {
  const result = spawnSync(command, ['--version'], {
    cwd: workspaceRoot,
    env,
    shell: isWindows,
    stdio: 'ignore',
  });
  return !result.error && result.status === 0;
}

function findOnPath(command) {
  const suffixes = isWindows ? ['', '.cmd', '.exe'] : [''];
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    for (const suffix of suffixes) {
      const candidate = join(directory, `${command}${suffix}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function isAndroidSdkRoot(candidate) {
  return Boolean(
    candidate &&
      (existsSync(join(candidate, 'platform-tools')) || existsSync(join(candidate, 'platforms'))),
  );
}

function sdkRootFromExecutable(executablePath) {
  let candidate = dirname(executablePath);
  for (let index = 0; index < 5; index += 1) {
    if (isAndroidSdkRoot(candidate)) return candidate;
    candidate = dirname(candidate);
  }
  return null;
}

function readLocalSdkDir() {
  const localPropertiesPath = resolve(androidRoot, 'local.properties');
  if (!existsSync(localPropertiesPath)) return null;
  const line = readFileSync(localPropertiesPath, 'utf8')
    .split(/\r?\n/)
    .find((value) => value.trim().startsWith('sdk.dir='));
  if (!line) return null;
  return line
    .slice(line.indexOf('=') + 1)
    .replace(/\\:/g, ':')
    .trim();
}

function resolveAndroidEnv() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    readLocalSdkDir(),
    join(homedir(), 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    '/usr/lib/android-sdk',
    '/opt/android-sdk',
    '/opt/android-sdk-linux',
  ];

  for (const candidate of candidates) {
    if (isAndroidSdkRoot(candidate)) {
      return {
        ...process.env,
        ANDROID_HOME: candidate,
        ANDROID_SDK_ROOT: candidate,
      };
    }
  }

  for (const command of ['adb', 'sdkmanager']) {
    const executable = findOnPath(command);
    const candidate = executable ? sdkRootFromExecutable(executable) : null;
    if (isAndroidSdkRoot(candidate)) {
      return {
        ...process.env,
        ANDROID_HOME: candidate,
        ANDROID_SDK_ROOT: candidate,
      };
    }
  }

  throw new Error(
    '找不到 Android SDK。请设置 ANDROID_HOME/ANDROID_SDK_ROOT，或让 Android Studio 生成 android/local.properties。',
  );
}

function formatCommand(command, commandArgs) {
  return [command, ...commandArgs]
    .map((value) => (/\s/.test(value) ? JSON.stringify(value) : value))
    .join(' ');
}

function run(label, command, commandArgs, options = {}) {
  const cwd = options.cwd || workspaceRoot;
  const env = { ...process.env, ...(options.env || {}) };
  console.log(`\n[package] ${label}`);
  console.log(`[package] cwd: ${relative(workspaceRoot, cwd) || '.'}`);
  console.log(`[package] $ ${formatCommand(command, commandArgs)}`);

  if (dryRun) return;

  const result = spawnSync(command, commandArgs, {
    cwd,
    env,
    shell: isWindows,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} 失败，退出码：${result.status ?? 'unknown'}`);
  }
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function cleanStaging() {
  mkdirSync(releaseRoot, { recursive: true });
  rmSync(stagingRoot, { recursive: true, force: true });
}

function cleanLegacyElectronOutputs() {
  const generatedDirectories = new Set(['.staging', 'linux-unpacked', 'win-unpacked']);
  const generatedFiles = new Set(['builder-debug.yml', 'latest-linux.yml', 'latest.yml']);

  for (const entry of readdirSync(releaseRoot, { withFileTypes: true })) {
    const generatedPackage =
      entry.name.startsWith('pneumata-client-') ||
      entry.name.startsWith('生息 Sense Murmur-');
    if (
      entry.name.startsWith('.') ||
      generatedDirectories.has(entry.name) ||
      generatedFiles.has(entry.name) ||
      generatedPackage
    ) {
      rmSync(join(releaseRoot, entry.name), { recursive: true, force: true });
    }
  }
}

function copyFinalArtifact(sourcePath, finalName) {
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new Error(`找不到预期产物：${sourcePath ? relative(workspaceRoot, sourcePath) : finalName}`);
  }

  const destination = resolve(releaseRoot, finalName);
  copyFileSync(sourcePath, destination);
  finalArtifacts.push(destination);
}

function archiveWindowsPortable() {
  const sourceDirectory = resolve(desktopOutputRoot, 'win-unpacked');
  if (!existsSync(sourceDirectory)) {
    throw new Error(`找不到 Windows x64 目录：${relative(workspaceRoot, sourceDirectory)}`);
  }
  if (!commandExists('jar')) {
    throw new Error('找不到 jar 命令，无法生成 Windows zip 包。请安装 JDK，或在 Windows 主机上打包。');
  }

  const destination = resolve(releaseRoot, `SenseMurmur-v${releaseVersion}-windows-x64.zip`);
  run('归档 Windows x64 便携包', 'jar', ['--create', '--file', destination, '-C', sourceDirectory, '.'], {
    cwd: clientRoot,
  });
  finalArtifacts.push(destination);
}

function archiveDesktopArtifacts() {
  if (dryRun) return;

  const stagedArtifacts = readdirSync(desktopOutputRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(desktopOutputRoot, entry.name));

  if (desktopTargets.linux) {
    const appImage = stagedArtifacts.find((filePath) => /\.AppImage$/i.test(filePath));
    copyFinalArtifact(appImage, `SenseMurmur-v${releaseVersion}-linux-x64.AppImage`);
  }

  if (desktopTargets.windows) {
    archiveWindowsPortable();
  }

  rmSync(stagingRoot, { recursive: true, force: true });
}

function archiveAndroidArtifact() {
  if (dryRun) return;

  const apkPath = resolve(
    androidRoot,
    'app',
    'build',
    'outputs',
    'apk',
    androidBuildType,
    `app-${androidBuildType}.apk`,
  );
  const suffix = androidBuildType === 'release' ? 'android' : 'android-debug';
  copyFinalArtifact(apkPath, `SenseMurmur-v${releaseVersion}-${suffix}.apk`);
}

function printArtifacts() {
  console.log('\n[package] 产物：');
  if (dryRun) {
    console.log('[package] dry-run 未生成文件。');
    return;
  }

  for (const artifact of finalArtifacts) {
    const size = statSync(artifact).size;
    console.log(`- ${relative(workspaceRoot, artifact)} (${formatSize(size)})`);
  }
}

function buildWeb() {
  const webEnv = {
    VITE_BACKEND_ORIGIN: process.env.VITE_BACKEND_ORIGIN || 'http://sense.lyixi.com:5170',
    VITE_APP_BASE: './',
    VITE_APP_ROUTER: 'hash',
    VITE_DISABLE_PWA: '1',
  };

  run(
    '构建桌面/移动端共用前端资源',
    npxCommand,
    ['--no-install', 'vite', 'build'],
    { cwd: clientRoot, env: webEnv },
  );
}

function prepareElectronApp() {
  if (dryRun) return;

  const clientPackage = JSON.parse(readFileSync(resolve(clientRoot, 'package.json'), 'utf8'));
  const electronVersion = clientPackage.devDependencies?.electron;
  if (!electronVersion) {
    throw new Error('找不到 Electron 版本，请检查 Pneumata-Client/package.json 的 devDependencies.electron。');
  }

  rmSync(electronAppRoot, { recursive: true, force: true });
  mkdirSync(electronAppRoot, { recursive: true });
  cpSync(resolve(clientRoot, 'dist'), resolve(electronAppRoot, 'dist'), { recursive: true });
  cpSync(resolve(clientRoot, 'electron'), resolve(electronAppRoot, 'electron'), { recursive: true });

  const packageJson = {
    name: 'sense-murmur-desktop',
    version: releaseVersion,
    private: true,
    description: 'Sense Murmur desktop client',
    main: 'electron/main.cjs',
    devDependencies: {
      electron: electronVersion,
    },
    build: {
      appId: 'com.lyixi.sensemurmur',
      productName: '生息 Sense Murmur',
      files: ['dist/**/*', 'electron/**/*', 'package.json'],
      directories: {
        output: relative(electronAppRoot, desktopOutputRoot),
      },
      npmRebuild: false,
      win: {
        target: ['dir'],
      },
      linux: {
        target: ['AppImage'],
      },
    },
  };

  writeFileSync(
    resolve(electronAppRoot, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}

function buildDesktop() {
  const electronArgs = [];
  if (isWindows) {
    if (!skipWindows) {
      electronArgs.push('--win', 'dir');
      desktopTargets.windows = true;
    }
  } else if (process.platform === 'linux') {
    if (!skipLinux) {
      electronArgs.push('--linux', 'AppImage');
      desktopTargets.linux = true;
    }
    if (!skipWindows) {
      electronArgs.push('--win', 'dir');
      desktopTargets.windows = true;
    }
  } else {
    throw new Error('一键脚本当前支持 Linux 和 Windows 主机；macOS 请先使用对应平台脚本。');
  }

  if (electronArgs.length > 0) {
    prepareElectronApp();
    run(
      '生成 Electron 桌面安装包',
      npxCommand,
      [
        '--no-install',
        'electron-builder',
        '--projectDir',
        relative(clientRoot, electronAppRoot),
        ...electronArgs,
        '--x64',
      ],
      { cwd: clientRoot },
    );
    archiveDesktopArtifacts();
  }
}

function buildAndroid() {
  const androidEnv = dryRun ? undefined : resolveAndroidEnv();
  run('同步 Capacitor Android 工程', npxCommand, ['--no-install', 'cap', 'sync', 'android'], {
    cwd: clientRoot,
    env: androidEnv,
  });

  const gradleName = isWindows ? 'gradlew.bat' : 'gradlew';
  const gradlePath = resolve(androidRoot, gradleName);
  if (!existsSync(gradlePath)) {
    throw new Error(`找不到 Android Gradle Wrapper：${relative(workspaceRoot, gradlePath)}`);
  }

  const task = `assemble${androidBuildType[0].toUpperCase()}${androidBuildType.slice(1)}`;
  run(`生成 Android ${androidBuildType} APK`, gradlePath, [task], {
    cwd: androidRoot,
    env: androidEnv,
  });
  archiveAndroidArtifact();
}

try {
  if (!dryRun) {
    cleanStaging();
    cleanLegacyElectronOutputs();
  }
  console.log(`[package] workspace: ${relative(workspaceRoot, clientRoot)}`);
  console.log(`[package] release version: ${releaseVersion}`);
  console.log(`[package] Android build type: ${androidBuildType}`);
  console.log(`[package] web build: ${skipWebBuild ? 'skipped' : 'yes'}`);
  console.log(`[package] dry-run: ${dryRun ? 'yes' : 'no'}`);

  if ((!skipDesktop || !skipAndroid) && !skipWebBuild) buildWeb();
  if (!skipDesktop) buildDesktop();
  if (!skipAndroid) buildAndroid();
  printArtifacts();
  console.log('\n[package] 全部打包完成。');
} catch (error) {
  console.error(`\n[package] 打包失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
