import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function exists(path) {
  return access(path).then(() => true, () => false);
}

async function git(cwd, args) {
  return (await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 })).stdout;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function installedPackageRoot(installRoot, packageName) {
  return join(installRoot, 'node_modules', ...packageName.split('/'));
}

async function prepareProductVersion(projectRoot, requestedRef, role, productsRoot) {
  const commit = (await git(projectRoot, ['rev-parse', '--verify', '--end-of-options', `${requestedRef}^{commit}`])).trim();
  const worktree = join(productsRoot, `${role}-worktree`);
  const archiveRoot = join(productsRoot, `${role}-archive`);
  const installRoot = join(productsRoot, `${role}-package`);
  await mkdir(archiveRoot, { recursive: true });
  await git(projectRoot, ['worktree', 'add', '--detach', '--quiet', worktree, commit]);
  try {
    const packageManifestContent = await readFile(join(worktree, 'package.json'));
    const packageManifest = JSON.parse(packageManifestContent.toString('utf8'));
    const packed = JSON.parse((await execFileAsync('npm', [
      'pack', '--json', '--pack-destination', archiveRoot,
    ], {
      cwd: worktree,
      maxBuffer: 20 * 1024 * 1024,
    })).stdout);
    if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0].filename !== 'string') {
      throw new Error(`installed_product_eval_pack_invalid:${role}`);
    }
    const archivePath = join(archiveRoot, packed[0].filename);
    await execFileAsync('npm', [
      'install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
      '--prefix', installRoot, archivePath,
    ], {
      cwd: productsRoot,
      maxBuffer: 20 * 1024 * 1024,
    });
    const productRoot = installedPackageRoot(installRoot, packageManifest.name);
    if (!await exists(join(productRoot, 'scripts', 'install-skills.mjs'))) {
      throw new Error(`installed_product_eval_installer_missing:${role}`);
    }
    return {
      role,
      productRoot,
      provenance: {
        requested_ref: requestedRef,
        commit,
        package_name: packageManifest.name,
        package_version: packageManifest.version,
        package_filename: packed[0].filename,
        package_sha256: sha256(await readFile(archivePath)),
        package_manifest_sha256: sha256(packageManifestContent),
        package_integrity: packed[0].integrity ?? null,
      },
    };
  } finally {
    await git(projectRoot, ['worktree', 'remove', '--force', worktree]).catch(() => '');
    await rm(worktree, { recursive: true, force: true });
  }
}

export async function prepareVersionProducts(projectRoot, versionRefs, tempRoot) {
  if (!versionRefs || typeof versionRefs.baseline !== 'string' || typeof versionRefs.candidate !== 'string') {
    throw new TypeError('versionRefs requires baseline and candidate Git refs');
  }
  const root = await mkdtemp(join(tempRoot, 'loopx-version-products-'));
  try {
    const baseline = await prepareProductVersion(projectRoot, versionRefs.baseline, 'baseline', root);
    const candidate = await prepareProductVersion(projectRoot, versionRefs.candidate, 'candidate', root);
    return { root, baseline, candidate };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function installVersionProduct(product, installEnv) {
  const { stdout } = await execFileAsync(process.execPath, [
    join(product.productRoot, 'scripts', 'install-skills.mjs'), '--json',
  ], {
    cwd: installEnv.LOOPX_INSTALL_CWD,
    env: installEnv,
    maxBuffer: 20 * 1024 * 1024,
  });
  const result = JSON.parse(stdout);
  return { ...result, ok: result.ok !== false };
}
