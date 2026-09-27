// Shared by the clean Docker build and the verifier streamed into the live API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const requiredFields = ['chartHasFastBasketBot', 'presetCloudRelayEnabled', 'relayRequestFiles'];
const manifestPath = 'apps/api/build-manifest.json';
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');

function filesBelow(root, relative) {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return filesBelow(root, name);
    assert(entry.isFile(), `Non-regular build input: ${name}`);
    return [name];
  });
}

function inventory(root, names) {
  return [...new Set(names)].sort().map((name) => ({
    path: name,
    sha256: hash(fs.readFileSync(path.join(root, name)))
  }));
}

// Match the sha256sum format used by the host (LC_ALL=C, relative POSIX paths).
function digest(files) {
  return hash(files.map((file) => `${file.sha256}  ${file.path}\n`).join(''));
}

function sourceInventory(root) {
  const names = [
    'package.json', 'apps/web/package.json', 'Dockerfile.api',
    'Dockerfile.api.dockerignore', 'scripts/api-build-integrity.cjs',
    ...filesBelow(root, 'apps/api/src'),
    ...fs.readdirSync(path.join(root, 'apps/api')).filter((name) => name.endsWith('.json')).map((name) => `apps/api/${name}`)
  ].filter((name) => name !== manifestPath);
  if (fs.existsSync(path.join(root, 'package-lock.json'))) names.push('package-lock.json');
  return inventory(root, names);
}

function compiledInventory(root) {
  assert(fs.existsSync(path.join(root, 'apps/api/dist/main.js')), 'Compiled main.js is missing');
  const worker = fs.readFileSync(path.join(root, 'apps/api/dist/worker.controller.js'), 'utf8');
  for (const field of requiredFields) {
    assert(worker.includes(field), `Compiled worker.controller.js is missing ${field}`);
  }
  return inventory(root, filesBelow(root, 'apps/api/dist'));
}

function validateExpected(revision, sourceSha256, buildId) {
  assert(/^[a-f0-9]{40}$/.test(revision || ''), 'A full Git commit SHA is required');
  assert(/^[a-f0-9]{64}$/.test(sourceSha256 || ''), 'A source SHA-256 is required');
  assert(/^[a-zA-Z0-9._-]+$/.test(buildId || ''), 'A build ID is required');
}

function record(root, revision, sourceSha256, buildId) {
  validateExpected(revision, sourceSha256, buildId);
  assert.equal(digest(sourceInventory(root)), sourceSha256, 'Docker source does not match the Git snapshot');
  const files = compiledInventory(root);
  const manifest = { schema: 1, revision, sourceSha256, buildId, distSha256: digest(files), files };
  fs.writeFileSync(path.join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function verify(root, revision, sourceSha256, buildId) {
  validateExpected(revision, sourceSha256, buildId);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
  assert.equal(manifest.schema, 1, 'Missing or obsolete API build manifest');
  assert.equal(manifest.revision, revision, 'API was built from a different commit');
  assert.equal(manifest.sourceSha256, sourceSha256, 'API source hash is stale');
  assert.equal(manifest.buildId, buildId, 'API belongs to a different build');
  const files = compiledInventory(root);
  assert.deepEqual(files, manifest.files, 'Compiled files were changed, added or removed after build');
  assert.equal(digest(files), manifest.distSha256, 'Compiled dist hash is invalid');
  return manifest;
}

if (require.main === module) {
  try {
    const [mode, revision, sourceSha256, buildId] = process.argv.slice(2);
    assert(['record', 'verify'].includes(mode), 'Usage: api-build-integrity.cjs record|verify SHA SOURCE_HASH BUILD_ID');
    const manifest = (mode === 'record' ? record : verify)(process.cwd(), revision, sourceSha256, buildId);
    console.log(`[SCENOVA] API ${mode}: commit=${manifest.revision} build=${manifest.buildId} dist=${manifest.distSha256}; Cloud Relay fields verified`);
  } catch (error) {
    console.error(`[SCENOVA] API integrity failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { sourceInventory, digest, record, verify };
