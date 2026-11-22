import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  MANAGED_COLOR_KEYS,
  buildColorCustomizations,
  contrastRatio,
  deriveColors,
  isHexColor,
  mergeColorCustomizations,
  parseHexInput,
  readableTextColor,
  relativeLuminance,
  removeManagedKeys
} from '../models/colors';
import { buildWindowTitle, isManagedWindowTitle } from '../models/windowTitle';
import {
  ACCENT_PRESETS,
  COLOR_EXAMPLE,
  DEFAULT_ACCENT_BY_TYPE
} from '../models/environment';

test('the shared palette contains only valid, unique colors', () => {
  const colors = ACCENT_PRESETS.map((preset) => preset.color);

  assert.ok(colors.every((color) => isHexColor(color)));
  assert.equal(new Set(colors).size, colors.length);
  assert.ok(isHexColor(COLOR_EXAMPLE));
});

test('every default accent comes from the shared palette', () => {
  const presets = ACCENT_PRESETS.map((preset) => preset.color);

  for (const accent of Object.values(DEFAULT_ACCENT_BY_TYPE)) {
    assert.ok(presets.includes(accent), accent);
  }
});

test('isHexColor accepts only six-digit hexadecimal colors', () => {
  assert.equal(isHexColor('#95ED9B'), true);
  assert.equal(isHexColor('#fff'), false);
  assert.equal(isHexColor('95ED9B'), false);
  assert.equal(isHexColor('#GGGGGG'), false);
  assert.equal(isHexColor(undefined), false);
});

test('parseHexInput accepts typed and pasted variants of a color', () => {
  assert.equal(parseHexInput('#EFF081'), '#EFF081');
  assert.equal(parseHexInput('#eff081'), '#eff081');
  assert.equal(parseHexInput('EFF081'), '#EFF081');
  assert.equal(parseHexInput('  #EFF081  '), '#EFF081');
  assert.equal(parseHexInput('#EFF081​'), '#EFF081'); // zero-width space
  assert.equal(parseHexInput('#EFF081 '), '#EFF081'); // non-breaking space
  assert.equal(parseHexInput('＃EFF081'), '#EFF081'); // full-width hash
  assert.equal(parseHexInput('"#EFF081"'), '#EFF081');
  assert.equal(parseHexInput('#FA0'), '#FFAA00');
});

test('parseHexInput rejects values that are not colors', () => {
  assert.equal(parseHexInput(''), undefined);
  assert.equal(parseHexInput('#EFF08'), undefined);
  assert.equal(parseHexInput('#EFF0811'), undefined);
  assert.equal(parseHexInput('#EFF08l'), undefined); // letter l instead of 1
  assert.equal(parseHexInput('red'), undefined);
  assert.equal(parseHexInput(undefined), undefined);
});

test('readableTextColor picks black on light and white on dark colors', () => {
  assert.equal(readableTextColor('#95ED9B'), '#000000'); // light green
  assert.equal(readableTextColor('#F9A825'), '#000000'); // yellow
  assert.equal(readableTextColor('#C62828'), '#FFFFFF'); // red
  assert.equal(readableTextColor('#1565C0'), '#FFFFFF'); // blue
  assert.equal(readableTextColor('#2E7D32'), '#FFFFFF'); // dark green
});

test('readable text always reaches at least a 3:1 contrast', () => {
  for (const color of ['#D6A928', '#2196D2', '#D97706', '#B91C1C', '#7952B3']) {
    assert.ok(contrastRatio(color, readableTextColor(color)) >= 3, color);
  }
});

test('deriveColors builds a darker background and a readable text color', () => {
  const colors = deriveColors('#2E7D32');

  assert.equal(colors.accent, '#2E7D32');
  assert.ok(isHexColor(colors.background));
  assert.ok(isHexColor(colors.sidebar));
  assert.ok(relativeLuminance(colors.background) < relativeLuminance(colors.accent));
  assert.equal(colors.text, readableTextColor('#2E7D32'));
});

test('buildColorCustomizations only uses managed keys', () => {
  const colors = deriveColors('#C62828');

  for (const tint of [true, false]) {
    const result = buildColorCustomizations(colors, { tintBackgrounds: tint });

    for (const key of Object.keys(result)) {
      assert.ok(MANAGED_COLOR_KEYS.includes(key), `unmanaged key ${key}`);
    }
  }
});

test('title, activity and status bars use the accent color', () => {
  const result = buildColorCustomizations(deriveColors('#C62828'), {
    tintBackgrounds: true
  });

  assert.equal(result['titleBar.activeBackground'], '#C62828');
  assert.equal(result['activityBar.background'], '#C62828');
  assert.equal(result['statusBar.background'], '#C62828');
  assert.equal(result['titleBar.activeForeground'], '#FFFFFF');
});

test('tintBackgrounds=false leaves editor and panels untouched', () => {
  const result = buildColorCustomizations(deriveColors('#C62828'), {
    tintBackgrounds: false
  });

  assert.equal('editor.background' in result, false);
  assert.equal('sideBar.background' in result, false);
  assert.equal('terminal.background' in result, false);
});

test('mergeColorCustomizations keeps unrelated keys and theme blocks', () => {
  const existing = {
    'editorCursor.foreground': '#FF00FF',
    '[Monokai]': { 'editor.background': '#111111' },
    'titleBar.activeBackground': '#000000',
    'editor.background': '#222222'
  };

  const ours = buildColorCustomizations(deriveColors('#2E7D32'), {
    tintBackgrounds: false
  });

  const merged = mergeColorCustomizations(existing, ours);

  assert.equal(merged['editorCursor.foreground'], '#FF00FF');
  assert.deepEqual(merged['[Monokai]'], { 'editor.background': '#111111' });
  assert.equal(merged['titleBar.activeBackground'], '#2E7D32');
  // Previously managed key is dropped when tinting is turned off.
  assert.equal('editor.background' in merged, false);
});

test('mergeColorCustomizations works without existing customizations', () => {
  const ours = buildColorCustomizations(deriveColors('#2E7D32'), {
    tintBackgrounds: true
  });

  assert.deepEqual(mergeColorCustomizations(undefined, ours), ours);
});

test('removeManagedKeys removes only Envhue keys', () => {
  const result = removeManagedKeys({
    'titleBar.activeBackground': '#123456',
    'editorCursor.foreground': '#FF00FF'
  });

  assert.deepEqual(result, { 'editorCursor.foreground': '#FF00FF' });
});

test('window title uses the type, or the name for CUSTOM environments', () => {
  assert.ok(buildWindowTitle({ name: 'Client A - PROD', type: 'PROD' }).startsWith('[PROD] '));
  assert.ok(buildWindowTitle({ name: 'Lab', type: 'CUSTOM' }).startsWith('[Lab] '));
});

test('isManagedWindowTitle recognizes only Envhue titles', () => {
  const title = buildWindowTitle({ name: 'x', type: 'DEV' });

  assert.equal(isManagedWindowTitle(title), true);
  assert.equal(isManagedWindowTitle('${rootName} - custom'), false);
  assert.equal(isManagedWindowTitle(undefined), false);
});
