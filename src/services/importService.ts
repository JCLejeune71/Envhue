import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  ImportCandidate,
  buildImportCandidate,
  parsePeacockColor,
  parseProjectManagerProjects
} from '../models/projectImport';

const PROJECT_MANAGER_ID = 'alefragnani.project-manager';

/** Where Project Manager keeps projects.json (setting, then its storage). */
function projectsFileCandidates(context: vscode.ExtensionContext): string[] {
  const home = os.homedir();
  const custom = vscode.workspace
    .getConfiguration('projectManager')
    .get<string>('projectsLocation', '')
    .trim();
  const files: string[] = [];

  if (custom) {
    files.push(path.join(custom.replace(/^~(?=[\\/]|$)/, home), 'projects.json'));
  }

  // Sibling of Envhue's own storage folder: .../User/globalStorage/<id>.
  files.push(
    path.join(
      path.dirname(context.globalStorageUri.fsPath),
      PROJECT_MANAGER_ID,
      'projects.json'
    )
  );

  return files;
}

async function readFirst(files: string[]): Promise<string | undefined> {
  for (const file of files) {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      // Try the next location.
    }
  }

  return undefined;
}

/**
 * Reads Project Manager's projects and, for local ones, the color Peacock
 * saved in the project's .vscode/settings.json. Returns undefined when no
 * projects file is found.
 */
export async function loadImportCandidates(
  context: vscode.ExtensionContext
): Promise<ImportCandidate[] | undefined> {
  const text = await readFirst(projectsFileCandidates(context));

  if (text === undefined) {
    return undefined;
  }

  const home = os.homedir();

  return Promise.all(
    parseProjectManagerProjects(text).map(async (project) => {
      let peacock: string | undefined;
      const first = buildImportCandidate(project, home);

      if (first.environment?.connection === 'local' ||
          first.environment?.connection === 'devcontainer') {
        const settings = await readFirst([
          path.join(first.environment.path, '.vscode', 'settings.json')
        ]);

        peacock = settings ? parsePeacockColor(settings) : undefined;
      }

      return peacock ? buildImportCandidate(project, home, peacock) : first;
    })
  );
}
