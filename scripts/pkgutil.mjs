import { access, cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import packageUtilities from '@cribl/apps/package';

export const {
  createAppPack,
  formatVersion,
  nextVersion,
  parseVersion,
  runNpmBuild,
  servePackageTgz,
} = packageUtilities;

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Materialize the Cribl pack layout at the repository root so a release tag
 * can be installed directly with Cribl's "Import from Git" flow.
 *
 * `npm run package -- --version X.Y.Z` stamps package.json before this runs,
 * so the version override is accepted for CLI symmetry but is not rewritten.
 */
export async function prepareGitPackLayout(_versionOverride = undefined) {
  const rootDir = join(import.meta.dirname, '..');
  const distDir = join(rootDir, 'dist');
  const staticDir = join(rootDir, 'static');
  const defaultDir = join(rootDir, 'default');

  if (!(await pathExists(distDir))) {
    throw new Error('dist folder not found. Run npm run build first.');
  }

  await rm(staticDir, { recursive: true, force: true });
  await rm(defaultDir, { recursive: true, force: true });
  await mkdir(staticDir, { recursive: true });
  await mkdir(defaultDir, { recursive: true });
  await cp(distDir, staticDir, { recursive: true });

  for (const file of ['policies.yml', 'proxies.yml', 'schedules.yml']) {
    const source = join(rootDir, 'config', file);
    if (await pathExists(source)) {
      await cp(source, join(defaultDir, file));
    }
  }
}
