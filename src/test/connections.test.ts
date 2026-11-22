import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { describeConnection, describeTarget } from '../models/describe';
import {
  decodeDevContainerHostPath,
  isSameHostPath,
  normalizeHostPath
} from '../models/devContainer';
import { normalizeEnvironment } from '../models/normalize';
import {
  READONLY_EXCLUDE_PATTERNS,
  READONLY_INCLUDE_PATTERNS,
  isLockApplied,
  withPatterns,
  withoutPatterns
} from '../models/readOnly';
import { buildWindowTitle, isManagedWindowTitle } from '../models/windowTitle';
import { parseWslDistroList } from '../models/wslList';

const hex = (value: string): string => Buffer.from(value, 'utf8').toString('hex');

// --- describe ---------------------------------------------------------------

test('describeConnection names every connection type', () => {
  assert.equal(describeConnection({ connection: 'local' }), 'Local');
  assert.equal(describeConnection({ connection: 'ssh', server: 'prod' }), 'SSH: prod');
  assert.equal(describeConnection({ connection: 'wsl', distro: 'Ubuntu' }), 'WSL: Ubuntu');
  assert.equal(describeConnection({ connection: 'devcontainer' }), 'Dev Container');
});

test('describeTarget includes the location and the path', () => {
  assert.equal(describeTarget({ connection: 'local', path: 'C:/work' }), 'C:/work');
  assert.equal(
    describeTarget({ connection: 'ssh', server: 'prod', path: '/srv/app' }),
    'prod:/srv/app'
  );
  assert.equal(
    describeTarget({ connection: 'wsl', distro: 'Ubuntu', path: '/home/me/app' }),
    'WSL Ubuntu:/home/me/app'
  );
  assert.equal(
    describeTarget({ connection: 'devcontainer', path: 'C:/work/app' }),
    'Dev Container · C:/work/app'
  );
});

// --- dev containers -----------------------------------------------------------

test('the host path is decoded from a plain-path dev container authority', () => {
  assert.equal(
    decodeDevContainerHostPath(`dev-container+${hex('/home/me/app')}`),
    '/home/me/app'
  );
});

test('the host path is decoded from a JSON dev container authority', () => {
  const payload = JSON.stringify({ hostPath: 'c:\\work\\app', localDocker: false });

  assert.equal(
    decodeDevContainerHostPath(`dev-container+${hex(payload)}`),
    'c:\\work\\app'
  );
});

test('a remote host suffix after the payload is ignored', () => {
  assert.equal(
    decodeDevContainerHostPath(`dev-container+${hex('/srv/app')}@ssh-remote+host`),
    '/srv/app'
  );
});

test('other authorities and invalid payloads give no host path', () => {
  assert.equal(decodeDevContainerHostPath('ssh-remote+host'), undefined);
  assert.equal(decodeDevContainerHostPath('wsl+Ubuntu'), undefined);
  assert.equal(decodeDevContainerHostPath('dev-container+zz'), undefined);
  assert.equal(decodeDevContainerHostPath(`dev-container+${hex('{not json')}`), undefined);
  assert.equal(decodeDevContainerHostPath(`dev-container+${hex('{"other":1}')}`), undefined);
});

test('host paths are compared regardless of slashes, drive case and trailing slash', () => {
  assert.equal(normalizeHostPath('C:\\Work\\App\\'), 'c:/work/app');
  assert.equal(normalizeHostPath('/c:/Work/App'), 'c:/work/app');
  assert.equal(normalizeHostPath('/'), '/');
  assert.equal(isSameHostPath('C:\\Work\\App', 'c:/work/app/'), true);
  assert.equal(isSameHostPath('/home/me/App', '/home/me/app'), false); // POSIX is case-sensitive
  assert.equal(isSameHostPath('/home/me/a', '/home/me/b'), false);
});

// --- WSL ----------------------------------------------------------------------

test('wsl.exe output in UTF-16LE is parsed', () => {
  const output = Buffer.from('\uFEFFUbuntu\r\ndocker-desktop\r\nDebian\r\n', 'utf16le');

  assert.deepEqual(parseWslDistroList(output), ['Ubuntu', 'Debian']);
});

test('UTF-8 output is parsed too, with duplicates removed', () => {
  const output = Buffer.from('Ubuntu-22.04\nUbuntu-22.04\ndocker-desktop-data\n', 'utf8');

  assert.deepEqual(parseWslDistroList(output), ['Ubuntu-22.04']);
});

test('empty output gives no distribution', () => {
  assert.deepEqual(parseWslDistroList(Buffer.alloc(0)), []);
});

// --- read-only lock -------------------------------------------------------------

test('locking adds only the Envhue patterns and keeps the others', () => {
  const include = withPatterns({ '**/*.pem': true }, READONLY_INCLUDE_PATTERNS);
  const exclude = withPatterns({ '**/notes/**': true }, READONLY_EXCLUDE_PATTERNS);

  assert.deepEqual(include, { '**/*.pem': true, '**': true });
  assert.equal(exclude['**/notes/**'], true);
  assert.equal(exclude['**/.vscode/**'], true);
  assert.equal(exclude['**/*.code-workspace'], true);
});

test('unlocking removes only the Envhue patterns', () => {
  assert.deepEqual(
    withoutPatterns({ '**/*.pem': true, '**': true }, READONLY_INCLUDE_PATTERNS),
    { '**/*.pem': true }
  );
});

test('unlocking returns undefined when nothing else is left', () => {
  assert.equal(withoutPatterns({ '**': true }, READONLY_INCLUDE_PATTERNS), undefined);
  assert.equal(withoutPatterns(undefined, READONLY_INCLUDE_PATTERNS), undefined);
});

test('isLockApplied detects the lock', () => {
  assert.equal(isLockApplied({ '**': true }), true);
  assert.equal(isLockApplied({ '**': false }), false);
  assert.equal(isLockApplied({ '**/*.pem': true }), false);
  assert.equal(isLockApplied(undefined), false);
});

// --- window title -----------------------------------------------------------------

test('the window title shows the read-only reminder', () => {
  const locked = buildWindowTitle({ name: 'Client A', type: 'PROD' }, true);
  const unlocked = buildWindowTitle({ name: 'Client A', type: 'PROD' }, false);

  assert.ok(locked.startsWith('[PROD · READ-ONLY] '));
  assert.ok(unlocked.startsWith('[PROD] '));
  assert.equal(isManagedWindowTitle(locked), true);
  assert.equal(isManagedWindowTitle(unlocked), true);
});

// --- normalization of the new fields ----------------------------------------------

test('a WSL environment keeps its distribution', () => {
  const env = normalizeEnvironment({
    name: 'WSL dev',
    type: 'DEV',
    connection: 'wsl',
    distro: 'wsl+Ubuntu',
    path: '/home/me/app'
  });

  assert.ok(env);
  assert.equal(env.connection, 'wsl');
  assert.equal(env.distro, 'Ubuntu');
  assert.equal(env.server, undefined);
});

test('the distribution is dropped for other connection types', () => {
  const env = normalizeEnvironment({
    name: 'Local',
    connection: 'local',
    distro: 'Ubuntu',
    path: '/x'
  });

  assert.ok(env);
  assert.equal(env.distro, undefined);
});

test('a dev container environment is a local folder reopened in its container', () => {
  const env = normalizeEnvironment({
    name: 'App container',
    type: 'DEV',
    connection: 'devcontainer',
    server: 'ignored',
    path: 'C:/work/app'
  });

  assert.ok(env);
  assert.equal(env.connection, 'devcontainer');
  assert.equal(env.server, undefined);
});

test('an unknown connection type falls back to local', () => {
  const env = normalizeEnvironment({ name: 'X', connection: 'ftp', path: '/x' });

  assert.ok(env);
  assert.equal(env.connection, 'local');
});

test('read-only mode is off unless explicitly enabled', () => {
  const off = normalizeEnvironment({ name: 'A', path: '/a' });
  const on = normalizeEnvironment({ name: 'B', path: '/b', readOnly: true });
  const invalid = normalizeEnvironment({ name: 'C', path: '/c', readOnly: 'yes' });
  const legacy = normalizeEnvironment({ Nom: 'D', Dossier: '/d', Confirmer: true });

  assert.equal(off?.readOnly, false);
  assert.equal(on?.readOnly, true);
  assert.equal(invalid?.readOnly, false);
  assert.equal(legacy?.readOnly, false);
});

test('environments of different connection types never share an id', () => {
  const local = normalizeEnvironment({ name: 'A', connection: 'local', path: '/srv/app' });
  const wsl = normalizeEnvironment({ name: 'A', connection: 'wsl', distro: 'Ubuntu', path: '/srv/app' });
  const other = normalizeEnvironment({ name: 'A', connection: 'wsl', distro: 'Debian', path: '/srv/app' });

  assert.ok(local && wsl && other);
  assert.notEqual(local.id, wsl.id);
  assert.notEqual(wsl.id, other.id);
});
