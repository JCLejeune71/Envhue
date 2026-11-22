import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildImportCandidate,
  guessEnvironmentType,
  isAlreadyRegistered,
  parsePeacockColor,
  parseProjectManagerProjects,
  parseRootPath,
  stripJsonc
} from '../models/projectImport';

const hex = (value: string): string => Buffer.from(value, 'utf8').toString('hex');

test('Project Manager list: keeps usable, enabled entries only', () => {
  const projects = parseProjectManagerProjects(
    JSON.stringify([
      { name: 'A', rootPath: 'C:\\a', tags: ['x', 3] },
      { name: 'Off', rootPath: 'C:\\off', enabled: false },
      { name: '', rootPath: 'C:\\none' },
      { rootPath: 'C:\\noname' },
      'garbage',
      null
    ])
  );

  assert.deepEqual(projects, [{ name: 'A', rootPath: 'C:\\a', tags: ['x'] }]);
  assert.deepEqual(parseProjectManagerProjects('not json'), []);
  assert.deepEqual(parseProjectManagerProjects('{"a":1}'), []);
});

test('rootPath: local, $home, SSH, WSL, Dev Container, unsupported', () => {
  assert.deepEqual(parseRootPath('$home/work/app', '/home/jc/'), {
    connection: 'local',
    path: '/home/jc/work/app'
  });
  assert.deepEqual(parseRootPath('C:\\work\\app', 'C:\\Users\\jc'), {
    connection: 'local',
    path: 'C:\\work\\app'
  });
  assert.deepEqual(parseRootPath('vscode-remote://ssh-remote+prod-host/srv/app', ''), {
    connection: 'ssh',
    server: 'prod-host',
    path: '/srv/app'
  });
  assert.deepEqual(parseRootPath('vscode-remote://wsl+Ubuntu/home/me/app', ''), {
    connection: 'wsl',
    distro: 'Ubuntu',
    path: '/home/me/app'
  });
  assert.deepEqual(
    parseRootPath(`vscode-remote://dev-container+${hex('c:\\work\\app')}/workspaces/app`, ''),
    { connection: 'devcontainer', path: 'c:\\work\\app' }
  );
  assert.ok('unsupported' in parseRootPath('vscode-remote://codespaces+abc/ws', ''));
  assert.ok('unsupported' in parseRootPath('https://example.com/x', ''));
});

test('type guess from name and tags', () => {
  assert.equal(guessEnvironmentType('Client A - PROD', []), 'PROD');
  assert.equal(guessEnvironmentType('client-a', ['pre-prod']), 'PREPROD');
  assert.equal(guessEnvironmentType('Client A staging', []), 'PREPROD');
  assert.equal(guessEnvironmentType('api', ['QA']), 'TEST');
  assert.equal(guessEnvironmentType('api dev', []), 'DEV');
  assert.equal(guessEnvironmentType('product catalog', []), undefined);
  assert.equal(guessEnvironmentType('Production-like sandbox', []), 'PROD');
});

test('Peacock color: peacock.color, title bar fallback, JSONC', () => {
  assert.equal(parsePeacockColor('{ "peacock.color": "#ab12cd" }'), '#AB12CD');
  assert.equal(
    parsePeacockColor(`{
      // comment with "quotes"
      "files.exclude": { "a//b": true, },
      "workbench.colorCustomizations": { "titleBar.activeBackground": "#42b883", },
    }`),
    '#42B883'
  );
  assert.equal(parsePeacockColor('{ "other": 1 }'), undefined);
  assert.equal(parsePeacockColor('{ broken'), undefined);
  assert.equal(stripJsonc('{"u":"http://x" /* c */}'), '{"u":"http://x" }');
});

test('candidate: Peacock color wins, type colors otherwise', () => {
  const withColor = buildImportCandidate(
    { name: 'Shop PROD', rootPath: 'C:\\shop', tags: [] },
    'C:\\Users\\jc',
    '#123456'
  );

  assert.equal(withColor.environment?.type, 'PROD');
  assert.equal(withColor.environment?.colors.accent, '#123456');
  assert.equal(withColor.colorSource, 'peacock');
  assert.equal(withColor.environment?.readOnly, false);

  const plain = buildImportCandidate(
    { name: 'misc', rootPath: 'C:\\misc', tags: [] },
    ''
  );

  assert.equal(plain.environment?.type, 'CUSTOM');
  assert.equal(plain.colorSource, 'default');

  const unsupported = buildImportCandidate(
    { name: 'cs', rootPath: 'vscode-remote://codespaces+x/ws', tags: [] },
    ''
  );

  assert.equal(unsupported.environment, undefined);
  assert.ok(unsupported.reason);
});

test('already registered: same id or same target', () => {
  const a = buildImportCandidate({ name: 'A', rootPath: 'C:\\Work\\A\\', tags: [] }, '').environment!;
  const same = buildImportCandidate({ name: 'Other', rootPath: 'c:/work/a', tags: [] }, '').environment!;
  const other = buildImportCandidate({ name: 'B', rootPath: 'C:\\work\\b', tags: [] }, '').environment!;
  const ssh = buildImportCandidate({ name: 'S', rootPath: 'vscode-remote://ssh-remote+h/srv', tags: [] }, '').environment!;

  assert.equal(isAlreadyRegistered(same, [a]), true);
  assert.equal(isAlreadyRegistered(other, [a]), false);
  assert.equal(isAlreadyRegistered(ssh, [a]), false);
  assert.equal(isAlreadyRegistered(ssh, [ssh]), true);
});
