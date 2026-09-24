import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { createAppPack, nextVersion, runNpmBuild } from './pkgutil.mjs';

const rootDir = join(import.meta.dirname, '..');
const packageJsonPath = join(rootDir, 'package.json');
const buildOutDir = join(rootDir, 'build');

const { values } = parseArgs({
  options: {
    major: { type: 'boolean' },
    minor: { type: 'boolean' },
    version: { type: 'string' },
  },
});

const selectedVersionOptions = [values.major, values.minor, values.version].filter(Boolean);
if (selectedVersionOptions.length > 1) {
  throw new Error('Use only one of --major, --minor, or --version.');
}

await runNpmBuild(rootDir);

const packageInfo = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const previousVersion = packageInfo.version ?? '0.0.0';
const newVersion = nextVersion(previousVersion, values);
packageInfo.version = newVersion;
await writeFile(packageJsonPath, `${JSON.stringify(packageInfo, null, 2)}\n`);

const tgzPath = join(buildOutDir, `${packageInfo.name ?? 'app'}-${newVersion}.tgz`);
await mkdir(buildOutDir, { recursive: true });

try {
  const { closePromise, stdout } = await createAppPack(rootDir, false);
  await Promise.all([pipeline(stdout, createWriteStream(tgzPath)), closePromise]);
} catch (error) {
  packageInfo.version = previousVersion;
  await writeFile(packageJsonPath, `${JSON.stringify(packageInfo, null, 2)}\n`);
  await rm(tgzPath, { force: true });
  throw error;
}

console.log(`\nPackage created: ${tgzPath}`);
