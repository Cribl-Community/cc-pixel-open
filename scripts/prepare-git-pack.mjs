/**
 * Materialize the Cribl App Platform pack layout at the repository root.
 *
 * Usage: node scripts/prepare-git-pack.mjs [--version X.Y.Z]
 */
import { prepareGitPackLayout } from './pkgutil.mjs';

const versionArgIndex = process.argv.indexOf('--version');
const versionOverride =
  versionArgIndex === -1 ? undefined : process.argv[versionArgIndex + 1];

await prepareGitPackLayout(versionOverride);
console.log('Git pack layout ready: static/, default/');
