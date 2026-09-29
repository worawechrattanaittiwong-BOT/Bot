const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { sourceInventory, digest, record, verify } = require('../scripts/api-build-integrity.cjs');

const revision = 'a'.repeat(40);
const build = '20260927-test';
const root = path.resolve(__dirname, '..');
const bash = process.env.BASH_BIN || 'bash';
const hasBash = spawnSync(bash, ['--version']).status === 0;

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenova-api-integrity-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (name, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  };
  for (const name of ['package.json', 'apps/web/package.json', 'apps/api/package.json', 'apps/api/tsconfig.json', 'apps/api/nest-cli.json']) write(name, '{}');
  for (const name of ['Dockerfile.api', 'Dockerfile.api.dockerignore', 'scripts/api-build-integrity.cjs']) write(name, fs.readFileSync(path.join(root, name)));
  write('apps/api/src/main.ts', 'export const current = true;');
  write('apps/api/dist/main.js', 'exports.current = true;');
  write('apps/api/dist/worker.controller.js', 'exports.diagnostics = { chartHasFastBasketBot: true, presetCloudRelayEnabled: true, relayRequestFiles: 1 };');
  return { dir, write, source: digest(sourceInventory(dir)) };
}

test('records a clean build and verifies its complete compiled inventory', (t) => {
  const f = fixture(t);
  const result = record(f.dir, revision, f.source, build);
  assert.deepEqual(verify(f.dir, revision, f.source, build), result);
  assert.equal(result.files.length, 2);
});

test('rejects source modified after the Git snapshot was fingerprinted', (t) => {
  const f = fixture(t);
  f.write('apps/api/src/main.ts', 'export const current = false;');
  assert.throws(() => record(f.dir, revision, f.source, build), /source does not match/);
});

test('rejects an old or unlabelled build even if the HTTP endpoint is healthy', (t) => {
  const f = fixture(t);
  assert.throws(() => verify(f.dir, revision, f.source, build), /ENOENT/);
  record(f.dir, revision, f.source, build);
  assert.throws(() => verify(f.dir, 'b'.repeat(40), f.source, build), /different commit/);
  assert.throws(() => verify(f.dir, revision, 'c'.repeat(64), build), /source hash is stale/);
  assert.throws(() => verify(f.dir, revision, f.source, 'old-build'), /different build/);
});

for (const modification of ['changed', 'added', 'removed']) {
  test(`rejects ${modification} compiled JS after build, with the original manifest still present`, (t) => {
    const f = fixture(t);
    f.write('apps/api/dist/extra.js', 'exports.value = 1;');
    record(f.dir, revision, f.source, build);
    if (modification === 'changed') f.write('apps/api/dist/extra.js', 'exports.value = 2;');
    if (modification === 'added') f.write('apps/api/dist/stale.js', 'exports.old = true;');
    if (modification === 'removed') fs.unlinkSync(path.join(f.dir, 'apps/api/dist/extra.js'));
    assert.throws(() => verify(f.dir, revision, f.source, build), /changed, added or removed/);
  });
}

for (const field of ['chartHasFastBasketBot', 'presetCloudRelayEnabled', 'relayRequestFiles']) {
  test(`requires ${field} in runtime JS, not just TypeScript or declaration files`, (t) => {
    const f = fixture(t);
    const worker = fs.readFileSync(path.join(f.dir, 'apps/api/dist/worker.controller.js'), 'utf8');
    f.write('apps/api/dist/worker.controller.js', worker.replace(field, 'oldField'));
    f.write('apps/api/dist/worker.controller.d.ts', field);
    assert.throws(() => record(f.dir, revision, f.source, build), new RegExp(`missing ${field}`));
  });
}

test('Bash host fingerprint and Node Docker fingerprint agree, including a lockfile', { skip: !hasBash }, (t) => {
  const f = fixture(t);
  f.write('package-lock.json', '{"lockfileVersion":3}');
  const result = spawnSync(bash, ['-c', '. scripts/lib/api-deploy.sh; api_source_digest "$FIXTURE_DIR"'], {
    cwd: root, env: { ...process.env, FIXTURE_DIR: f.dir.replaceAll('\\', '/') }, encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), digest(sourceInventory(f.dir)));
});

test('runtime gate propagates failure inside an if condition used by the timer', { skip: !hasBash }, () => {
  // Real shell gate, mocked Docker boundary: health succeeds for old images too.
  const script = `
    . scripts/lib/api-deploy.sh
    docker() {
      case "$1" in
        ps) [ "$SCENARIO" != missing ] && printf 'container-id\\n'; return 0 ;;
        inspect)
          case "$3" in
            '{{.Image}}') echo image-new ;;
            *image.revision*) echo "$EXPECTED_SHA" ;;
            *source-sha256*) echo "$EXPECTED_SOURCE" ;;
            *build-id*) echo build-new ;;
            *State.Running*) if [ "$SCENARIO" = unhealthy ]; then echo 'true false unhealthy'; else echo 'true false healthy'; fi ;;
          esac ;;
        exec)
          if [ "$2" = -i ]; then
            cat >/dev/null
            [ "$SCENARIO" != stale ] || return 1
          elif [ "$SCENARIO" = badhealth ]; then return 1
          fi ;;
      esac
    }
    if verify_api_runtime "$EXPECTED_SHA" "$EXPECTED_SOURCE" "$EXPECTED_IMAGE" build-new; then exit 0; else exit 42; fi
  `;
  for (const scenario of ['fresh', 'stale', 'missing', 'unhealthy', 'badhealth', 'wrong-image']) {
    const result = spawnSync(bash, ['-c', script], {
      cwd: root, encoding: 'utf8', env: { ...process.env, SCENARIO: scenario,
        EXPECTED_SHA: revision, EXPECTED_SOURCE: 'd'.repeat(64), EXPECTED_IMAGE: scenario === 'wrong-image' ? 'image-old' : 'image-new' }
    });
    assert.equal(result.status, scenario === 'fresh' ? 0 : 42, `${scenario}: ${result.stdout}\n${result.stderr}`);
  }
});

test('auto-deployer repairs a matching stale marker and only records a verified release', { skip: process.platform === 'win32' ? 'Runs against the Linux VPS shell/runtime' : !hasBash }, (t) => {
  const f = fixture(t);
  const deployFiles = ['scripts/auto-deploy-vps.sh', 'scripts/deploy-hostinger.sh', 'scripts/lib/api-deploy.sh', 'infrastructure/linux/docker-compose.hostinger.yml'];
  for (const name of deployFiles) f.write(name, fs.readFileSync(path.join(root, name)));
  const deployText = fs.readFileSync(path.join(root, 'scripts/deploy-hostinger.sh'), 'utf8');
  for (const name of deployText.match(/database\/[a-zA-Z0-9_]+\.sql/g)) f.write(name, '-- fixture migration\n');
  f.write('.gitignore', '.env.hostinger\n.mock/\n');
  f.write('.env.hostinger', 'POSTGRES_PASSWORD=fixture\nJWT_SECRET=fixture\nADMIN_KEY=fixture\nWORKER_KEY=fixture\nCREDENTIAL_MASTER_KEY=fixture\nPUBLIC_WEB_URL=https://fixture.invalid\nWEB_ORIGIN=https://fixture.invalid\nAPP_DOMAIN=fixture.invalid\nBOT_WEB_PORT=3100\n');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: f.dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'Deploy test');
  git('config', 'user.email', 'deploy-test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', '.mock/no-hooks');
  git('add', '.');
  git('commit', '-m', 'fixture release');
  const sha = git('rev-parse', 'HEAD');
  git('remote', 'add', 'origin', 'https://github.com/SCENOVA-SNV/Bot.git');
  git('update-ref', 'refs/remotes/origin/main', sha);
  const realGit = spawnSync(bash, ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  const bin = (name, contents) => {
    f.write(`.mock/bin/${name}`, `#!/usr/bin/env bash\nset -euo pipefail\n${contents}\n`);
    fs.chmodSync(path.join(f.dir, `.mock/bin/${name}`), 0o755);
  };
  bin('git', 'if [ "$1" = fetch ] || { [ "$1" = config ] && [ "${2:-}" = --global ]; }; then exit 0; fi\nexec "$REAL_GIT" "$@"');
  bin('flock', 'exit 0');
  bin('gh', "printf 'completed:success\\n'");
  bin('curl', "printf '127.0.0.1\\n'");
  bin('openssl', "printf '0123456789abcdef\\n'");
  bin('docker', `
    printf '%s\\n' "$*" >> "$MOCK_DIR/commands.log"
    case "$1" in
      compose)
        if [[ " $* " == *' build '* && "$SCENARIO" = build-failure ]]; then exit 1; fi
        if [[ " $* " == *' up '* && "$*" == *' api' ]]; then
          printf 'MOCK_SHA=%s\\nMOCK_SOURCE=%s\\nMOCK_BUILD=%s\\n' "$API_BUILD_SHA" "$API_SOURCE_SHA256" "$API_BUILD_ID" > "$MOCK_DIR/runtime"
        fi
        if [[ " $* " == *' psql '* ]]; then cat >/dev/null; fi
        ;;
      image) echo image-new ;;
      run) cat >/dev/null ;;
      ps) [ ! -f "$MOCK_DIR/runtime" ] || echo container-id ;;
      inspect)
        . "$MOCK_DIR/runtime"
        case "$3" in
          '{{.Image}}') echo image-new ;;
          *image.revision*) echo "$MOCK_SHA" ;;
          *source-sha256*) echo "$MOCK_SOURCE" ;;
          *build-id*) echo "$MOCK_BUILD" ;;
          *State.Running*) echo 'true false healthy' ;;
        esac ;;
      exec)
        if [ "$2" = -i ]; then cat >/dev/null; [ "$SCENARIO" != stale-after-up ]; fi
        ;;
    esac
  `);
  const mockDir = path.join(f.dir, '.mock').replaceAll('\\', '/');
  const environment = {
    ...process.env, REAL_GIT: realGit, MOCK_DIR: mockDir, REPO_DIR: f.dir.replaceAll('\\', '/'),
    SCENOVA_STATE_DIR: `${mockDir}/state`, SCENOVA_DEPLOY_LOCK_FILE: `${mockDir}/deploy.lock`,
    // Ensure inherited developer-shell values cannot bypass the fixture's lock or pin.
    // The lock itself is exercised by the VPS shell and systemd. This fixture
    // focuses on stale-image recovery and avoids depending on Windows flock.
    SCENOVA_DEPLOY_LOCK_HELD: '1', DEPLOY_SHA: ''
  };
  for (const scenario of ['build-failure', 'stale-after-up', 'success']) {
    f.write('.mock/state/deployed.sha', scenario === 'success' ? `${sha}\n` : `${'0'.repeat(40)}\n`);
    f.write('.mock/runtime', `MOCK_SHA=${'0'.repeat(40)}\nMOCK_SOURCE=${'0'.repeat(64)}\nMOCK_BUILD=old\n`);
    f.write('.mock/commands.log', '');
    const result = spawnSync(bash, ['-c', 'export PATH="$MOCK_DIR/bin:$PATH"; bash scripts/auto-deploy-vps.sh'], {
      cwd: f.dir, env: { ...environment, SCENARIO: scenario }, encoding: 'utf8', timeout: 30000
    });
    assert.equal(result.status, scenario === 'success' ? 0 : 1, `${scenario}: ${result.stdout}\n${result.stderr}`);
    assert.equal(fs.readFileSync(path.join(f.dir, '.mock/state/deployed.sha'), 'utf8').trim(), scenario === 'success' ? sha : '0'.repeat(40));
    const commands = fs.readFileSync(path.join(f.dir, '.mock/commands.log'), 'utf8');
    assert.match(commands, /build --no-cache --pull api/);
    if (scenario === 'build-failure') assert.doesNotMatch(commands, / up /);
    if (scenario === 'success') {
      assert.match(result.stdout, /marker is current but running API is stale/);
      assert.match(commands, /--no-build --pull never --force-recreate.* api/);
      assert.match(commands, /compose --project-name linux/);
      // A subsequent timer tick must verify the live files, without a rebuild.
      f.write('.mock/commands.log', '');
      const again = spawnSync(bash, ['-c', 'export PATH="$MOCK_DIR/bin:$PATH"; bash scripts/auto-deploy-vps.sh'], {
        cwd: f.dir, env: { ...environment, SCENARIO: scenario }, encoding: 'utf8', timeout: 30000
      });
      assert.equal(again.status, 0, `${again.stdout}\n${again.stderr}`);
      const nextCommands = fs.readFileSync(path.join(f.dir, '.mock/commands.log'), 'utf8');
      assert.match(nextCommands, /node - verify/);
      assert.doesNotMatch(nextCommands, / build /);
    }
  }
});
