import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildEnvironmentRows } from '../models/panelModel';
import { normalizeEnvironment } from '../models/normalize';

const env = (extra: object) =>
  normalizeEnvironment({ name: 'Shop', path: '/srv/shop', connection: 'ssh', server: 'h', ...extra })!;

test('panel rows describe the current environment', () => {
  const rows = buildEnvironmentRows(env({ type: 'PROD', client: 'Acme', favorite: true }), true);
  const get = (id: string) => rows.find((row) => row.id === id)!;

  assert.equal(get('name').description, 'Shop');
  assert.equal(get('client').description, 'Acme');
  assert.equal(get('type').icon, 'warning');
  assert.equal(get('confirmation').description, 'On (always for PROD)');
  assert.equal(get('lock').description, 'Locked');
  assert.equal(get('lock').icon, 'lock');
  assert.equal(get('favorite').icon, 'star-full');
  assert.equal(get('location').description, 'h:/srv/shop');
  assert.ok(rows.every((row) => row.command.startsWith('envhue.')));
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
});

test('panel rows for a plain unlocked environment', () => {
  const rows = buildEnvironmentRows(env({ type: 'DEV', requireConfirmation: true }), false);
  const get = (id: string) => rows.find((row) => row.id === id)!;

  assert.equal(get('client').description, 'none');
  assert.equal(get('confirmation').description, 'On');
  assert.equal(get('readOnlyDefault').description, 'Off');
  assert.equal(get('lock').description, 'Unlocked');
  assert.equal(get('lock').icon, 'unlock');
  assert.equal(get('type').icon, 'layers');
});

test('panel shows the time left of a temporary unlock', () => {
  const rows = buildEnvironmentRows(env({ type: 'PROD' }), false, 12);

  assert.equal(rows.find((row) => row.id === 'lock')!.description, 'Unlocked (12 min left)');
});
