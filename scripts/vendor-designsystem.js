import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'node_modules/oj-designsystem');
const destination = path.join(root, 'src/vendor/oj-designsystem');
const consumer = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'oj-designsystem');
assert.equal(consumer.dependencies?.[pkg.name], pkg.version, 'Pin oj-designsystem to its exact installed version.');

async function filesIn(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink(), `Cannot vendor a symbolic link: ${relative}`);
    if (entry.isDirectory()) files.push(...await filesIn(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

const distribution = path.join(source, 'dist');
const assets = await filesIn(path.join(distribution, 'assets'), 'assets');
const licenses = await filesIn(path.join(distribution, 'licenses'), 'licenses');
assert.ok(assets.length && assets.every((file) => file.endsWith('.woff2')), 'Expected local WOFF2 fonts/icons.');
assert.ok(licenses.length && licenses.every((file) => file.endsWith('.txt')), 'Expected original font/icon notices.');
const files = ['index.js', 'styles.css', ...assets, ...licenses, 'LICENSE', 'THIRD-PARTY-NOTICES.md'].sort();
const hashes = {};
// Read and hash everything before replacing the previous snapshot.
for (const file of files) {
  const original = path.join(file === 'LICENSE' || file === 'THIRD-PARTY-NOTICES.md' ? source : distribution, file);
  hashes[file] = createHash('sha256').update(await readFile(original)).digest('hex');
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const file of files) {
  const original = path.join(file === 'LICENSE' || file === 'THIRD-PARTY-NOTICES.md' ? source : distribution, file);
  await mkdir(path.dirname(path.join(destination, file)), { recursive: true });
  await cp(original, path.join(destination, file));
}
const metadata = {
  schemaVersion: 1,
  package: {
    name: pkg.name,
    version: pkg.version,
    repository: 'https://github.com/oliverjessner/oj-designsystem',
  },
  files: hashes,
};
await writeFile(path.join(destination, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
console.info(`Vendored ${pkg.name} ${pkg.version}: ${files.length} unmodified files with SHA256 provenance.`);
