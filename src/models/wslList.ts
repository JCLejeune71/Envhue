// Pure helper (no "vscode" or "child_process" import) so it can be tested.

/**
 * Parses the output of `wsl.exe --list --quiet`. Windows prints it in
 * UTF-16LE (unless WSL_UTF8 is set), so both encodings are handled. Docker
 * Desktop's internal distributions are not usable as development targets and
 * are skipped.
 */
export function parseWslDistroList(output: Buffer): string[] {
  const text = output.includes(0)
    ? output.toString('utf16le')
    : output.toString('utf8');

  const names = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\0/g, '').replace(/^﻿/, '').trim())
    .filter((line) => line && !/^docker-desktop(-data)?$/i.test(line));

  return [...new Set(names)];
}
