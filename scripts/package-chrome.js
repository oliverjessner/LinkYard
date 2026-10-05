import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const runtimeDirectories = [
  'src/background', 'src/components', 'src/services', 'src/sidepanel',
  'src/storage', 'src/utils', 'src/assets/icons',
];
const runtimeExtensions = new Set(['.js', '.html', '.css', '.png']);

async function runtimeFiles(root, relativeDirectory) {
  const entries = await readdir(path.join(root, relativeDirectory), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Cannot package a symbolic link: ${relativePath}`);
    if (entry.isDirectory()) files.push(...await runtimeFiles(root, relativePath));
    else if (entry.isFile() && runtimeExtensions.has(path.extname(entry.name))) files.push(relativePath);
  }
  return files;
}

export async function packageChrome(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (!/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) throw new Error('Invalid extension version in manifest.json.');
  const files = ['manifest.json', 'src/constants.js'];
  for (const directory of runtimeDirectories) files.push(...await runtimeFiles(root, directory));
  const outputDirectory = path.join(root, 'dist');
  await mkdir(outputDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(outputDirectory, '.chrome-package-'));
  const temporaryArchive = path.join(temporaryDirectory, 'extension.zip');
  const archive = path.join(outputDirectory, `linkyard-${manifest.version}.zip`);
  try {
    // Start with a fresh ZIP: updating an old archive could retain deleted files.
    // An explicit allowlist excludes credentials, docs, screenshots and tooling.
    await exec('zip', ['-q', '-X', temporaryArchive, ...files], { cwd: root });
    await exec('unzip', ['-tq', temporaryArchive]);
    await rename(temporaryArchive, archive);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Packaging requires zip and unzip on PATH. Install them and try again.');
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  return { archive, version: manifest.version, files, bytes: (await stat(archive)).size };
}
