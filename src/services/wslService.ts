import { execFile } from 'child_process';
import { promisify } from 'util';
import { parseWslDistroList } from '../models/wslList';

const execFileAsync = promisify(execFile);

/**
 * Lists the installed WSL distributions. Envhue runs as a UI extension, so
 * this queries the local Windows machine. Returns an empty list on other
 * platforms or when WSL is not installed or does not answer in time.
 */
export async function listWslDistros(): Promise<string[]> {
  if (process.platform !== 'win32') {
    return [];
  }

  try {
    const { stdout } = await execFileAsync('wsl.exe', ['--list', '--quiet'], {
      encoding: 'buffer',
      timeout: 5000,
      windowsHide: true
    });

    return parseWslDistroList(stdout);
  } catch {
    return [];
  }
}
