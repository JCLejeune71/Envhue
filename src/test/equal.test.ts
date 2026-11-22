import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { sameValue } from '../models/equal';

test('sameValue ignores prototypes and key order', () => {
  const frozenNullProto = Object.assign(Object.create(null), { a: 1, b: { c: [1, 2] } });

  assert.equal(sameValue(frozenNullProto, { b: { c: [1, 2] }, a: 1 }), true);
  assert.equal(sameValue({ a: 1 }, { a: 2 }), false);
  assert.equal(sameValue(undefined, undefined), true);
  assert.equal(sameValue(undefined, {}), false);
  assert.equal(sameValue({ '**': true }, { '**': true, x: true }), false);
});
