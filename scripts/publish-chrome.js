import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageChrome } from './package-chrome.js';
import { createWebStoreClient, readConfiguration } from './chrome-webstore.js';

const root = path.resolve(import.meta.dirname, '..');
const usage = `Usage: npm run publish:chrome -- [--dry-run | --upload-only]

  --dry-run      Run checks/tests and create the ZIP locally. No credentials needed.
  --upload-only  Upload the ZIP as a draft without submitting it for publication.
  --help         Show this help.

By default, the script uploads and submits the package for publication.
Configure credentials in .env using .env.example. Uses Chrome Web Store API v2.`;

export function parseArguments(args) {
  const allowed = new Set(['--dry-run', '--upload-only', '--help']);
  for (const argument of args) {
    if (!allowed.has(argument)) throw new Error(`Unknown argument: ${argument}. Run npm run publish:chrome -- --help.`);
  }
  if (args.includes('--dry-run') && args.includes('--upload-only')) {
    throw new Error('Choose either --dry-run or --upload-only.');
  }
  return { dryRun: args.includes('--dry-run'), uploadOnly: args.includes('--upload-only'), help: args.includes('--help') };
}

function runNpm(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm run ${script} failed. Publishing stopped.`));
    });
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { console.info(usage); return; }
  let configuration;
  if (!options.dryRun) {
    try { loadEnvFile(path.join(root, '.env')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    configuration = readConfiguration(process.env);
  }
  await runNpm('check');
  await runNpm('test');
  const { archive, version, files, bytes } = await packageChrome(root);
  console.info(`Packaged LinkYard ${version}: ${path.relative(root, archive)} (${files.length} files, ${Math.ceil(bytes / 1024)} KB).`);
  if (options.dryRun) { console.info('Dry run complete. No Web Store requests were made.'); return; }

  const client = createWebStoreClient(configuration);
  console.info('Authenticating with Google…');
  await client.authenticate();
  console.info('Uploading to the Chrome Web Store…');
  await client.upload(archive, version);
  if (options.uploadOnly) { console.info('Upload succeeded. The draft is ready in the Developer Dashboard.'); return; }
  console.info('Submitting for publication…');
  const submission = await client.publish();
  console.info(`Submission state: ${submission.state}.`);
  for (const warning of submission.warningInfo?.warnings || []) {
    console.info(`Web Store warning: ${warning.reason || 'unspecified'}. See the Developer Dashboard for details.`);
  }
  if (submission.state === 'PENDING_REVIEW') console.info('Submitted for review. Chrome will publish it after approval.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Chrome Web Store: ${error.message}`);
    process.exitCode = 1;
  });
}
