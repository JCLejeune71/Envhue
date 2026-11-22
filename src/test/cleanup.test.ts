import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  looksLikeProduction,
  productionEnvironmentFor,
  suggestTypeForTarget
} from '../models/prodDetection';
import { cleanSettings, cleanSettingsText } from '../models/settingsCleanup';

test('production detection: whole words in name, host, distro, last folders', () => {
  assert.equal(suggestTypeForTarget({ server: 'prod-db-01', path: '/srv/app' }), 'PROD');
  assert.equal(suggestTypeForTarget({ path: '/srv/clients/acme-prod/app' }), 'PROD');
  assert.equal(suggestTypeForTarget({ distro: 'Ubuntu', path: '/home/me/app' }), undefined);
  assert.equal(suggestTypeForTarget({ server: 'stg', path: '/srv/product-catalog' }), undefined);
  assert.equal(suggestTypeForTarget({ server: 'preprod-1', path: '/srv/app' }), 'PREPROD');
  // Only the last two folders count: a prod folder far up is ignored.
  assert.equal(suggestTypeForTarget({ path: '/prod/a/b/c' }), undefined);
});

test('looksLikeProduction on locations', () => {
  assert.equal(looksLikeProduction('vscode-remote://ssh-remote%2Bprod-host/srv/app', ''), true);
  assert.equal(looksLikeProduction('vscode-remote://ssh-remote+web-01/srv/app', ''), false);
  assert.equal(looksLikeProduction('C:\\work\\client\\prod', 'C:\\Users\\jc'), true);
  assert.equal(looksLikeProduction('https://example.com/prod', ''), false);
});

test('registration as PROD keeps the target and the read-only choice', () => {
  const env = productionEnvironmentFor('vscode-remote://ssh-remote+prod-host/srv/app', '', true);

  assert.equal(env?.type, 'PROD');
  assert.equal(env?.connection, 'ssh');
  assert.equal(env?.server, 'prod-host');
  assert.equal(env?.path, '/srv/app');
  assert.equal(env?.name, 'app - PROD');
  assert.equal(env?.readOnly, true);
  assert.equal(env?.requireConfirmation, true);
  assert.equal(productionEnvironmentFor('https://x/y', '', false), undefined);
});

test('cleanSettings removes only what Envhue wrote', () => {
  const { settings, changed } = cleanSettings({
    'editor.fontSize': 14,
    'window.title': '[PROD · READ-ONLY] ${activeEditorShort}${separator}${rootName}',
    'workbench.colorCustomizations': {
      'titleBar.activeBackground': '#C33D3D',
      'editor.background': '#111111',
      '[Dark+]': { 'editor.background': '#000000' }
    },
    'files.readonlyInclude': { '**': true, '**/dist/**': true },
    'files.readonlyExclude': { '**/.vscode/**': true, '**/*.code-workspace': true }
  });

  assert.equal(changed, true);
  assert.equal(settings['editor.fontSize'], 14);
  assert.equal(settings['window.title'], undefined);
  assert.deepEqual(settings['files.readonlyInclude'], { '**/dist/**': true });
  assert.equal(settings['files.readonlyExclude'], undefined);
  assert.ok((settings['workbench.colorCustomizations'] as object)['[Dark+]' as never]);
});

test('cleanSettings leaves a user title and unrelated colors alone', () => {
  const input = {
    'window.title': '${rootName}',
    'workbench.colorCustomizations': { 'editorCursor.foreground': '#111111' }
  };

  assert.equal(cleanSettings(input).changed, false);
});

test('cleanSettingsText: strict JSON is rewritten, comments are reported', () => {
  const strict = '{\n    "a": 1,\n    "window.title": "[DEV] ${activeEditorShort}"\n}';
  const result = cleanSettingsText(strict);

  assert.equal(result.status, 'cleaned');
  assert.equal(result.status === 'cleaned' && result.text, '{\n    "a": 1\n}\n');

  const commented = '{\n  // mine\n  "window.title": "[DEV] ${activeEditorShort}"\n}';
  assert.equal(cleanSettingsText(commented).status, 'manual');

  const commentedNothing = '{\n  // mine\n  "a": 1\n}';
  assert.equal(cleanSettingsText(commentedNothing).status, 'untouched');
  assert.equal(cleanSettingsText('{"a":1}').status, 'untouched');
  assert.equal(cleanSettingsText('{ broken "window.title"').status, 'manual');
});
