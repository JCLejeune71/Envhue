import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { deriveColors } from '../models/colors';
import { normalizeEnvironment, normalizeSetup } from '../models/normalize';

test('invalid entries are dropped', () => {
  assert.equal(normalizeEnvironment(undefined), undefined);
  assert.equal(normalizeEnvironment('text'), undefined);
  assert.equal(normalizeEnvironment({}), undefined);
  assert.equal(normalizeEnvironment({ name: 'No path' }), undefined);
  assert.equal(normalizeEnvironment({ name: '  ', path: '/x' }), undefined);
});

test('a minimal entry gets defaults and a derived palette', () => {
  const env = normalizeEnvironment({ name: 'Dev', path: 'C:/work/dev', type: 'DEV' });

  assert.ok(env);
  assert.equal(env.connection, 'local');
  assert.equal(env.requireConfirmation, false);
  assert.equal(env.favorite, false);
  assert.deepEqual(env.colors, deriveColors(env.colors.accent));
});

test('missing background, sidebar and text are derived from the accent', () => {
  const env = normalizeEnvironment({
    name: 'Anapalma',
    path: 'x:/hugo/anapalma',
    type: 'CUSTOM',
    colors: { accent: '#95ED9B' }
  });

  assert.ok(env);
  assert.equal(env.colors.accent, '#95ED9B');
  assert.equal(env.colors.text, '#000000');
  assert.equal(env.colors.background, deriveColors('#95ED9B').background);
});

test('explicit colors are kept and invalid ones are replaced', () => {
  const env = normalizeEnvironment({
    name: 'Dev',
    path: '/srv/dev',
    type: 'DEV',
    colors: { accent: '#2E7D32', background: '#000000', sidebar: 'not-a-color', text: '#FFFFFF' }
  });

  assert.ok(env);
  assert.equal(env.colors.background, '#000000');
  assert.equal(env.colors.sidebar, deriveColors('#2E7D32').sidebar);
});

test('an unknown type falls back to CUSTOM', () => {
  const env = normalizeEnvironment({ name: 'X', path: '/x', type: 'WHATEVER' });

  assert.ok(env);
  assert.equal(env.type, 'CUSTOM');
});

test('ssh environments strip the ssh-remote+ prefix', () => {
  const env = normalizeEnvironment({
    name: 'Prod',
    type: 'PROD',
    connection: 'ssh',
    server: 'ssh-remote+prod-host',
    path: '/srv/app'
  });

  assert.ok(env);
  assert.equal(env.connection, 'ssh');
  assert.equal(env.server, 'prod-host');
});

test('local environments never keep a server', () => {
  const env = normalizeEnvironment({
    name: 'Dev',
    type: 'DEV',
    connection: 'local',
    server: 'ignored',
    path: '/srv/app'
  });

  assert.ok(env);
  assert.equal(env.server, undefined);
});

test('the legacy launcher format is migrated', () => {
  const env = normalizeEnvironment({
    Nom: 'PROD',
    Dossier: 'e:/Private/Adentis/prod',
    Accent: '#c62828',
    Fond: '#2a0e0e',
    Lateral: '#361313',
    Texte: '#ffffff',
    Confirmer: true
  });

  assert.ok(env);
  assert.equal(env.name, 'PROD');
  assert.equal(env.path, 'e:/Private/Adentis/prod');
  assert.equal(env.type, 'PROD');
  assert.equal(env.requireConfirmation, true);
  assert.deepEqual(env.colors, {
    accent: '#c62828',
    background: '#2a0e0e',
    sidebar: '#361313',
    text: '#ffffff'
  });
});

test('a legacy entry with a server becomes an ssh environment', () => {
  const env = normalizeEnvironment({ Nom: 'Remote', Dossier: '/srv', Serveur: 'host' });

  assert.ok(env);
  assert.equal(env.connection, 'ssh');
  assert.equal(env.server, 'host');
});

test('an entry without id gets a stable id', () => {
  const input = { name: 'Dev', path: '/srv/dev' };
  const first = normalizeEnvironment(input);
  const second = normalizeEnvironment({ ...input });
  const other = normalizeEnvironment({ name: 'Dev', path: '/srv/other' });

  assert.ok(first && second && other);
  assert.equal(first.id, second.id);
  assert.notEqual(first.id, other.id);
});

test('an explicit id is preserved', () => {
  const env = normalizeEnvironment({ id: 'my-id', name: 'Dev', path: '/srv/dev' });

  assert.ok(env);
  assert.equal(env.id, 'my-id');
});

test('normalizeSetup filters, lowercases and deduplicates extension ids', () => {
  const setup = normalizeSetup({
    mode: 'extensions',
    extensions: ['EamodiO.GitLens', 'eamodio.gitlens', 'not valid', 42]
  });

  assert.deepEqual(setup, { mode: 'extensions', extensions: ['eamodio.gitlens'] });
});

test('normalizeSetup validates profile and mode', () => {
  assert.deepEqual(normalizeSetup({ mode: 'profile', profileName: ' Ops ' }), {
    mode: 'profile',
    profileName: 'Ops'
  });
  assert.equal(normalizeSetup({ mode: 'profile' }), undefined);
  assert.equal(normalizeSetup({ mode: 'unknown' }), undefined);
  assert.deepEqual(normalizeSetup({ mode: 'none' }), { mode: 'none' });
});
