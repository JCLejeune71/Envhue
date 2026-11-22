import * as vscode from 'vscode';
import { describeTarget } from '../models/describe';
import { Environment } from '../models/environment';
import { ImportCandidate, isAlreadyRegistered } from '../models/projectImport';
import { EnvironmentService } from '../services/environmentService';
import { loadImportCandidates } from '../services/importService';

type ImportItem = vscode.QuickPickItem & { environment: Environment };

const SOURCE_LABEL: Record<ImportCandidate['colorSource'], string> = {
  peacock: 'Peacock color',
  type: 'type guessed from name',
  default: 'type to review'
};

/** Imports projects from Project Manager (and their Peacock colors). */
export async function importProjects(
  context: vscode.ExtensionContext,
  service: EnvironmentService
): Promise<void> {
  const candidates = await loadImportCandidates(context);

  if (candidates === undefined) {
    void vscode.window.showInformationMessage(
      'Envhue found no Project Manager projects file. Install "Project Manager" ' +
      'and save a project, or set "projectManager.projectsLocation" if you moved it.'
    );
    return;
  }

  const existing = service.getAll();
  const importable: ImportItem[] = [];
  let alreadyThere = 0;
  const skipped: string[] = [];

  for (const candidate of candidates) {
    if (!candidate.environment) {
      skipped.push(`${candidate.project.name} (${candidate.reason})`);
    } else if (isAlreadyRegistered(candidate.environment, existing)) {
      alreadyThere++;
    } else {
      importable.push({
        label: candidate.environment.name,
        description:
          `${candidate.environment.type} · ${SOURCE_LABEL[candidate.colorSource]}`,
        detail: describeTarget(candidate.environment),
        environment: candidate.environment
      });
    }
  }

  if (importable.length === 0) {
    void vscode.window.showInformationMessage(
      `Nothing to import: ${alreadyThere} project(s) already registered` +
      (skipped.length ? `, ${skipped.length} not supported.` : '.')
    );
    return;
  }

  
  const picked = await vscode.window.showQuickPick(importable, {
    title: 'Envhue — Import from Project Manager',
    placeHolder:
      `Select projects to import `,
    canPickMany: true,
    matchOnDetail: true,
    ignoreFocusOut: true
  });

  if (!picked || picked.length === 0) {
    return;
  }

  const chosen = picked.slice(0);
  await service.saveAll([...existing, ...chosen.map((item) => item.environment)]);

  const notes: string[] = [];

  if (chosen.length < picked.length) {
    notes.push(`${picked.length - chosen.length} left out (Free limit)`);
  }

  if (skipped.length) {
    notes.push(`${skipped.length} unsupported`);
  }

  void vscode.window.showInformationMessage(
    `Imported ${chosen.length} environment(s)` +
    (notes.length ? ` — ${notes.join(', ')}` : '') +
    '. Use "Manage Environments" to review types and colors.'
  );
}
