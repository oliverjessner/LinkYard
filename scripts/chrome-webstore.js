import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const API_ROOT = 'https://chromewebstore.googleapis.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ENVIRONMENT_KEYS = {
  publisherId: 'CWS_PUBLISHER_ID',
  extensionId: 'CWS_EXTENSION_ID',
  clientId: 'CWS_CLIENT_ID',
  clientSecret: 'CWS_CLIENT_SECRET',
  refreshToken: 'CWS_REFRESH_TOKEN',
};

export function readConfiguration(environment) {
  const configuration = {};
  const missing = [];
  for (const [key, variable] of Object.entries(ENVIRONMENT_KEYS)) {
    const value = environment[variable]?.trim();
    if (!value) missing.push(variable);
    else configuration[key] = value;
  }
  if (missing.length) throw new Error(`Missing ${missing.join(', ')}. Copy .env.example to .env and configure your Web Store credentials.`);
  if (!/^[a-zA-Z0-9_-]+$/.test(configuration.publisherId)) throw new Error('CWS_PUBLISHER_ID must be the publisher ID from the Developer Dashboard.');
  if (!/^[a-p]{32}$/.test(configuration.extensionId)) throw new Error('CWS_EXTENSION_ID must be the 32-character Web Store extension ID.');
  return configuration;
}

function redact(message, secrets) {
  let safe = String(message);
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join('[redacted]');
  }
  return safe;
}

export function createWebStoreClient(configuration, {
  fetchImpl = fetch,
  sleep = delay,
  pollIntervalMs = 5000,
  maxPolls = 24,
} = {}) {
  const secrets = [configuration.clientSecret, configuration.refreshToken];
  const itemPath = `/v2/publishers/${encodeURIComponent(configuration.publisherId)}/items/${configuration.extensionId}`;
  let accessToken;

  async function request(url, options, label) {
    try {
      const response = await fetchImpl(url, {
        ...options, signal: AbortSignal.timeout(60_000), redirect: 'error',
      });
      let body;
      try { body = await response.json(); }
      catch { throw new Error(`${label} returned invalid JSON (HTTP ${response.status}).`); }
      if (!response.ok) {
        const detail = body.error?.message || body.error_description ||
          (typeof body.error === 'string' ? body.error : response.statusText);
        throw new Error(`${label} failed (HTTP ${response.status}): ${detail || 'Request rejected.'}`);
      }
      return body;
    } catch (error) {
      throw new Error(redact(error.message, secrets));
    }
  }

  async function authenticate() {
    const response = await request(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        refresh_token: configuration.refreshToken,
        grant_type: 'refresh_token',
      }),
    }, 'Google OAuth');
    if (typeof response.access_token !== 'string' || !response.access_token) {
      throw new Error('Google OAuth did not return an access token. Check your OAuth credentials and refresh token.');
    }
    accessToken = response.access_token;
    secrets.push(accessToken);
  }

  function authorizedRequest(url, options, label) {
    if (!accessToken) throw new Error('Authenticate before calling the Web Store API.');
    return request(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    }, label);
  }

  async function upload(archive, expectedVersion) {
    const response = await authorizedRequest(`${API_ROOT}/upload${itemPath}:upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: await readFile(archive),
    }, 'Web Store upload');
    if (response.crxVersion && response.crxVersion !== expectedVersion) {
      throw new Error('The Web Store returned a different package version. Check the Developer Dashboard before publishing.');
    }
    let state = response.uploadState;
    for (let attempt = 0; state === 'IN_PROGRESS' && attempt < maxPolls; attempt++) {
      await sleep(pollIntervalMs);
      const status = await authorizedRequest(`${API_ROOT}${itemPath}:fetchStatus`, { method: 'GET' }, 'Web Store upload status');
      state = status.lastAsyncUploadState;
    }
    if (state === 'IN_PROGRESS') throw new Error('Upload processing timed out. Check the Developer Dashboard; nothing was submitted for publishing.');
    if (state !== 'SUCCEEDED') throw new Error(`Web Store upload did not succeed (${state || 'missing upload state'}). Check the Developer Dashboard; nothing was submitted for publishing.`);
  }

  async function publish() {
    const response = await authorizedRequest(`${API_ROOT}${itemPath}:publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
    }, 'Web Store publish submission');
    if (!['PENDING_REVIEW', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'].includes(response.state)) {
      throw new Error(`Unexpected publish state (${response.state || 'missing state'}). Check the Developer Dashboard before retrying.`);
    }
    return response;
  }

  return { authenticate, upload, publish };
}
