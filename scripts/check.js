import { readFile, readdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'LinkYard');
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.background.type, 'module');
assert.deepEqual([...manifest.permissions].sort(), ['contextMenus', 'sidePanel', 'storage']);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.action.default_popup, undefined);
assert.ok(manifest.description.length <= 132);
await access(path.join(root, manifest.background.service_worker));
await access(path.join(root, manifest.side_panel.default_path));
for (const icons of [manifest.icons, manifest.action.default_icon]) {
  for (const [size, file] of Object.entries(icons)) {
    const png = await readFile(path.join(root, file));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', `${file} must be PNG`);
    assert.equal(png.readUInt32BE(16), Number(size), `${file} width`);
    assert.equal(png.readUInt32BE(20), Number(size), `${file} height`);
  }
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) assert.ok(!entry.isSymbolicLink(), `Cannot validate a symbolic link: ${path.join(directory, entry.name)}`);
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return nested.flat();
}
const files = (await Promise.all(['src', 'scripts', 'tests'].map((directory) => filesIn(path.join(root, directory))))).flat();
const vendorPath = path.join(root, 'src/vendor/oj-designsystem');
const metadata = JSON.parse(await readFile(path.join(vendorPath, 'metadata.json'), 'utf8'));
assert.equal(metadata.schemaVersion, 1);
assert.equal(metadata.package.name, 'oj-designsystem');
assert.equal(metadata.package.version, pkg.dependencies?.['oj-designsystem'], 'Vendored design system must match the exact dependency pin.');
assert.equal(metadata.package.repository, 'https://github.com/oliverjessner/oj-designsystem');
const vendorFiles = (await filesIn(vendorPath)).map((file) => path.relative(vendorPath, file).split(path.sep).join('/'));
assert.deepEqual(vendorFiles.filter((file) => file !== 'metadata.json').sort(), Object.keys(metadata.files).sort(), 'Vendored files must exactly match their provenance manifest.');
for (const [file, expected] of Object.entries(metadata.files)) {
  assert.match(expected, /^[a-f0-9]{64}$/, `Invalid SHA256 for ${file}`);
  const actual = createHash('sha256').update(await readFile(path.join(vendorPath, file))).digest('hex');
  assert.equal(actual, expected, `Vendored asset changed: ${file}; run npm run vendor:designsystem after updating the pinned package.`);
}
for (const file of files.filter((file) => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    await access(path.resolve(path.dirname(file), match[1]));
  }
  if (file.includes(`${path.sep}src${path.sep}`)) {
    assert.doesNotMatch(source, /\.innerHTML\s*=|\beval\s*\(|console\.log\s*\(|\bfetch\s*\(/, file);
  }
}
for (const file of files.filter((file) => file.endsWith('.css'))) {
  const source = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(source, /@import\b/i, `${file}: use local stylesheet links instead of CSS imports.`);
  for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) {
    const reference = match[1] ?? match[2] ?? match[3];
    assert.ok(reference && !/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(reference), `${file}: CSS assets must use local relative URLs (${reference}).`);
    const asset = path.resolve(path.dirname(file), reference.split(/[?#]/, 1)[0]);
    assert.ok(asset.startsWith(path.join(root, 'src') + path.sep), `${file}: CSS asset escapes src (${reference}).`);
    await access(asset);
  }
}
const panelPath = path.join(root, manifest.side_panel.default_path);
const html = await readFile(panelPath, 'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) await access(path.resolve(path.dirname(panelPath), match[1]));
assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|\son\w+=/i);
console.info('Manifest V3, permissions, icon sizes, local assets, design-system provenance, imports and JavaScript syntax verified.');
