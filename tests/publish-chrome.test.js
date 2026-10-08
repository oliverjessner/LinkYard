import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { packageChrome } from '../scripts/package-chrome.js';
import { createWebStoreClient, readConfiguration } from '../scripts/chrome-webstore.js';
import { parseArguments } from '../scripts/publish-chrome.js';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const configuration = {
  publisherId: 'publisher-123', extensionId: 'a'.repeat(32),
  clientId: 'test-client', clientSecret: 'test-client-secret', refreshToken: 'test-refresh-token',
};

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'linkyard-publish-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function testArchive(t) {
  const directory = await temporaryDirectory(t);
  const archive = path.join(directory, 'extension.zip');
  await writeFile(archive, 'test-archive-bytes');
  return archive;
}

function mockRequests(responses) {
  const requests = [];
  return {
    requests,
    async fetchImpl(url, options) {
      requests.push({ url, options });
      const next = responses.shift();
      assert.ok(next, `Unexpected request: ${url}`);
      return new Response(JSON.stringify(next.body), { status: next.status || 200 });
    },
  };
}

test('release options distinguish local packaging, upload-only and publication', () => {
  assert.deepEqual(parseArguments([]), { dryRun: false, uploadOnly: false, help: false });
  assert.equal(parseArguments(['--dry-run']).dryRun, true);
  assert.equal(parseArguments(['--upload-only']).uploadOnly, true);
  assert.equal(parseArguments(['--help']).help, true);
  assert.throws(() => parseArguments(['--dry-run', '--upload-only']));
  assert.throws(() => parseArguments(['--publish-typo']));
});

test('missing configuration reports variable names without exposing values', () => {
  assert.throws(() => readConfiguration({ CWS_CLIENT_SECRET: 'private-secret' }), (error) => {
    assert.match(error.message, /CWS_PUBLISHER_ID/);
    assert.match(error.message, /CWS_REFRESH_TOKEN/);
    assert.doesNotMatch(error.message, /private-secret/);
    return true;
  });
});

test('configuration validates item identifiers and trims environment values', () => {
  const environment = {
    CWS_PUBLISHER_ID: ' publisher-123 ', CWS_EXTENSION_ID: 'a'.repeat(32),
    CWS_CLIENT_ID: 'test-client', CWS_CLIENT_SECRET: 'test-client-secret', CWS_REFRESH_TOKEN: 'test-refresh-token',
  };
  assert.deepEqual(readConfiguration(environment), configuration);
  assert.throws(() => readConfiguration({ ...environment, CWS_EXTENSION_ID: 'bad' }));
  assert.throws(() => readConfiguration({ ...environment, CWS_PUBLISHER_ID: '../bad' }));
});

test('release ZIP includes runtime files and manifest at root, excluding private/dev assets', async (t) => {
  const directory = await temporaryDirectory(t);
  await cp(path.join(root, 'manifest.json'), path.join(directory, 'manifest.json'));
  await cp(path.join(root, 'src'), path.join(directory, 'src'), { recursive: true });
  await writeFile(path.join(directory, '.env'), 'CWS_CLIENT_SECRET=must-not-be-packaged');
  await writeFile(path.join(directory, 'src/sidepanel/.private.js'), 'must-not-be-packaged');
  const result = await packageChrome(directory);
  const { stdout } = await exec('unzip', ['-Z1', result.archive]);
  const files = stdout.trim().split('\n');
  assert.ok(files.includes('manifest.json'));
  assert.ok(files.includes('src/background/service-worker.js'));
  assert.ok(files.includes('src/sidepanel/app.js'));
  assert.ok(files.includes('src/assets/icons/icon-128.png'));
  assert.equal(files.some((file) => /\.env|screens\/|images\/|tests\/|scripts\/|README|\.private/.test(file)), false);
  const packedManifest = JSON.parse((await exec('unzip', ['-p', result.archive, 'manifest.json'])).stdout);
  assert.equal(packedManifest.version, result.version);
  assert.ok(result.bytes > 0);
  await writeFile(path.join(directory, 'src/sidepanel/old-module.js'), 'export const old = true;');
  await packageChrome(directory);
  await rm(path.join(directory, 'src/sidepanel/old-module.js'));
  await packageChrome(directory);
  assert.doesNotMatch((await exec('unzip', ['-Z1', result.archive])).stdout, /old-module/);
});

test('unsafe manifest versions fail before creating an archive', async (t) => {
  const directory = await temporaryDirectory(t);
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: '../../outside' }));
  await assert.rejects(packageChrome(directory), /Invalid extension version/);
});

test('release ZIP preserves offline design-system assets and notices while excluding dependencies and vendor docs', async (t) => {
  const directory = await temporaryDirectory(t);
  await cp(path.join(root, 'manifest.json'), path.join(directory, 'manifest.json'));
  await cp(path.join(root, 'src'), path.join(directory, 'src'), { recursive: true });
  const vendorPath = 'src/vendor/oj-designsystem';
  await mkdir(path.join(directory, 'node_modules/oj-designsystem'), { recursive: true });
  await mkdir(path.join(directory, vendorPath, 'docs'), { recursive: true });
  await writeFile(path.join(directory, 'node_modules/oj-designsystem/index.js'), 'must-not-be-packaged');
  await writeFile(path.join(directory, vendorPath, 'README.md'), 'must-not-be-packaged');
  await writeFile(path.join(directory, vendorPath, 'docs/guide.md'), 'must-not-be-packaged');
  await writeFile(path.join(directory, vendorPath, '.env'), 'must-not-be-packaged');
  await writeFile(path.join(directory, vendorPath, 'tokens.css'), 'must-not-be-packaged');
  const result = await packageChrome(directory);
  const files = (await exec('unzip', ['-Z1', result.archive])).stdout.trim().split('\n');
  const metadata = JSON.parse(await readFile(path.join(directory, vendorPath, 'metadata.json'), 'utf8'));
  const expectedFiles = [...Object.keys(metadata.files), 'metadata.json'].map((file) => `${vendorPath}/${file}`).sort();
  assert.deepEqual(files.filter((file) => file.startsWith(`${vendorPath}/`)).sort(), expectedFiles);
  assert.ok(expectedFiles.some((file) => /assets\/fonts\/comfortaa-latin-ext-.*\.woff2$/.test(file)));
  assert.ok(expectedFiles.includes(`${vendorPath}/assets/fontawesome/fa-solid-900.woff2`));
  assert.ok(expectedFiles.includes(`${vendorPath}/licenses/fontawesome-free-LICENSE.txt`));
  assert.ok(expectedFiles.includes(`${vendorPath}/LICENSE`));
  assert.ok(expectedFiles.includes(`${vendorPath}/THIRD-PARTY-NOTICES.md`));
  assert.equal(files.some((file) => /node_modules|\/docs\/|README|\.env|tokens\.css/.test(file)), false);
  for (const [file, hash] of Object.entries(metadata.files)) {
    const { stdout } = await exec('unzip', ['-p', result.archive, `${vendorPath}/${file}`], { encoding: 'buffer' });
    assert.equal(createHash('sha256').update(stdout).digest('hex'), hash, `Archive must preserve ${file} bytes.`);
  }
});

test('OAuth refresh, binary upload and publication use the v2 API contract', async (t) => {
  const archive = await testArchive(t);
  const mock = mockRequests([
    { body: { access_token: 'test-access-token' } },
    { body: { uploadState: 'SUCCEEDED', crxVersion: '0.1.1' } },
    { body: { state: 'PENDING_REVIEW' } },
  ]);
  const client = createWebStoreClient(configuration, mock);
  await client.authenticate();
  await client.upload(archive, '0.1.1');
  assert.equal((await client.publish()).state, 'PENDING_REVIEW');
  const [token, upload, publish] = mock.requests;
  assert.equal(token.url, 'https://oauth2.googleapis.com/token');
  assert.equal(token.options.body.get('grant_type'), 'refresh_token');
  assert.equal(token.options.body.get('refresh_token'), configuration.refreshToken);
  assert.equal(upload.url, `https://chromewebstore.googleapis.com/upload/v2/publishers/publisher-123/items/${configuration.extensionId}:upload`);
  assert.equal(upload.options.method, 'POST');
  assert.deepEqual(upload.options.body, await readFile(archive));
  assert.equal(upload.options.headers.Authorization, 'Bearer test-access-token');
  assert.equal(publish.url, `https://chromewebstore.googleapis.com/v2/publishers/publisher-123/items/${configuration.extensionId}:publish`);
  assert.deepEqual(JSON.parse(publish.options.body), { publishType: 'DEFAULT_PUBLISH' });
});

test('async upload waits for lastAsyncUploadState before allowing submission', async (t) => {
  const archive = await testArchive(t);
  const mock = mockRequests([
    { body: { access_token: 'test-access-token' } },
    { body: { uploadState: 'IN_PROGRESS' } },
    { body: { lastAsyncUploadState: 'IN_PROGRESS' } },
    { body: { lastAsyncUploadState: 'SUCCEEDED' } },
  ]);
  const waits = [];
  const client = createWebStoreClient(configuration, { ...mock, sleep: async (milliseconds) => waits.push(milliseconds) });
  await client.authenticate();
  await client.upload(archive, '0.1.1');
  assert.deepEqual(waits, [5000, 5000]);
  assert.ok(mock.requests[2].url.endsWith(':fetchStatus'));
  assert.equal(mock.requests.some(({ url }) => url.endsWith(':publish')), false);
});

test('failed upload is surfaced and does not submit a release', async (t) => {
  const mock = mockRequests([{ body: { access_token: 'test-access-token' } }, { body: { uploadState: 'FAILED' } }]);
  const client = createWebStoreClient(configuration, mock);
  await client.authenticate();
  await assert.rejects(client.upload(await testArchive(t), '0.1.1'), /did not succeed/);
  assert.equal(mock.requests.length, 2);
});

test('upload processing times out without automatic POST retries', async (t) => {
  const mock = mockRequests([
    { body: { access_token: 'test-access-token' } }, { body: { uploadState: 'IN_PROGRESS' } },
    { body: { lastAsyncUploadState: 'IN_PROGRESS' } },
  ]);
  const client = createWebStoreClient(configuration, { ...mock, sleep: async () => {}, maxPolls: 1 });
  await client.authenticate();
  await assert.rejects(client.upload(await testArchive(t), '0.1.1'), /timed out/);
  assert.equal(mock.requests.filter(({ options }) => options.method === 'POST').length, 2);
});

test('unexpected upload and mismatched package versions fail safely', async (t) => {
  const archive = await testArchive(t);
  for (const body of [{ uploadState: 'NOT_FOUND' }, {}, { uploadState: 'SUCCEEDED', crxVersion: 'wrong' }]) {
    const mock = mockRequests([{ body: { access_token: 'test-access-token' } }, { body }]);
    const client = createWebStoreClient(configuration, mock);
    await client.authenticate();
    await assert.rejects(client.upload(archive, '0.1.1'));
  }
});

test('OAuth and API failures redact secrets and access tokens', async () => {
  const oauth = createWebStoreClient(configuration, mockRequests([
    { status: 400, body: { error_description: `invalid ${configuration.clientSecret} ${configuration.refreshToken}` } },
  ]));
  await assert.rejects(oauth.authenticate(), (error) => {
    assert.match(error.message, /HTTP 400/);
    assert.doesNotMatch(error.message, /test-client-secret|test-refresh-token/);
    return true;
  });
  const api = createWebStoreClient(configuration, mockRequests([
    { body: { access_token: 'test-access-token' } },
    { status: 403, body: { error: { message: 'invalid test-access-token' } } },
  ]));
  await api.authenticate();
  await assert.rejects(api.publish(), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /test-access-token/);
    return true;
  });
});

test('non-JSON responses and missing tokens produce readable errors', async () => {
  const invalidJson = createWebStoreClient(configuration, { fetchImpl: async () => new Response('gateway unavailable', { status: 502 }) });
  await assert.rejects(invalidJson.authenticate(), /invalid JSON \(HTTP 502\)/);
  const missingToken = createWebStoreClient(configuration, mockRequests([{ body: {} }]));
  await assert.rejects(missingToken.authenticate(), /did not return an access token/);
});

test('authentication is required and rejected publication states are not reported as success', async () => {
  const mock = mockRequests([{ body: { access_token: 'test-access-token' } }, { body: { state: 'REJECTED' } }]);
  const client = createWebStoreClient(configuration, mock);
  await assert.rejects(client.publish(), /Authenticate/);
  await client.authenticate();
  await assert.rejects(client.publish(), /Unexpected publish state/);
});
