
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describeConnection } from '../models/describe';
import { Environment } from '../models/environment';

export async function createEnvironmentQuickPickItems(
  context: vscode.ExtensionContext,
  environments: Environment[]
): Promise<Array<vscode.QuickPickItem & { environment: Environment }>> {

  const iconDirectory = path.join(
    context.globalStorageUri.fsPath,
    'environment-icons'
  );

  await fs.mkdir(iconDirectory, { recursive: true });

  return Promise.all(
    environments.map(async (environment) => {
      const color = /^#[0-9A-Fa-f]{6}$/.test(environment.colors.accent)
        ? environment.colors.accent
        : '#808080';

      const iconFile = path.join(
        iconDirectory,
        `${color.substring(1).toLowerCase()}.svg`
      );

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
             viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6"
                  fill="${color}" stroke="#FFFFFF" stroke-width="1"/>
        </svg>
      `;

      try {
        await fs.access(iconFile);
      } catch {
        await fs.writeFile(iconFile, svg, 'utf8');
      }

      return {
        label: environment.name,
        description:
          `${environment.type} · ${describeConnection(environment)}` +
          (environment.readOnly ? ' · read-only' : ''),
        detail: environment.path,
        iconPath: vscode.Uri.file(iconFile),
        environment
      };
    })
  );
}
