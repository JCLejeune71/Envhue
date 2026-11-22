import * as vscode from 'vscode';
import { describeConnection } from '../models/describe';
import { Environment } from '../models/environment';
import { buildEnvironmentRows } from '../models/panelModel';
import { getUnlockDeadline, isLocked } from '../services/readOnlyService';
import { EnvironmentService } from '../services/environmentService';
import { findCurrentEnvironment } from '../services/uriService';

type Node =
  | { kind: 'section'; id: 'current' | 'all' ; label: string }
  | { kind: 'row'; id: string; label: string; description: string; tooltip: string; icon: string; command: string }
  | { kind: 'environment'; environment: Environment; current: boolean }
  | { kind: 'message'; label: string; command?: string };

/** Side panel opened from the Envhue icon in the activity bar. */
export class EnvironmentPanel implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(
    private readonly service: EnvironmentService,
  ) {}

  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case 'section': {
        const item = new vscode.TreeItem(
          node.label,
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.id = `section-${node.id}`;
        return item;
      }

      case 'row': {
        const item = new vscode.TreeItem(node.label);
        item.id = `row-${node.id}`;
        item.description = node.description;
        item.tooltip = `${node.label}: ${node.description}\n${node.tooltip}`;
        item.iconPath = new vscode.ThemeIcon(node.icon);
        item.command = { command: node.command, title: node.tooltip };
        return item;
      }

      case 'environment': {
        const { environment } = node;
        const item = new vscode.TreeItem(environment.name);
        item.id = `env-${environment.id}`;
        item.description =
          `${environment.type} · ${describeConnection(environment)}` +
          (environment.readOnly ? ' · read-only' : '') +
          (node.current ? ' · current' : '');
        item.tooltip = `${environment.name}\nClick to open this environment`;
        item.iconPath = new vscode.ThemeIcon(
          node.current ? 'circle-filled' : 'circle-outline'
        );
        item.command = {
          command: 'envhue.panel.open',
          title: 'Open environment',
          arguments: [environment.id]
        };
        return item;
      }

      default: {
        const item = new vscode.TreeItem(node.label);
        item.iconPath = new vscode.ThemeIcon('info');

        if (node.command) {
          item.command = { command: node.command, title: node.label };
        }

        return item;
      }
    }
  }

  getChildren(node?: Node): Node[] {
    const environments = this.service.getAll();
    const match = findCurrentEnvironment(
      vscode.workspace.workspaceFolders,
      environments
    );

    if (!node) {
      return [
        { kind: 'section', id: 'current', label: 'Current environment' },
        { kind: 'section', id: 'all', label: `Environments (${environments.length})` }
      ];
    }

    if (node.kind !== 'section') {
      return [];
    }

    if (node.id === 'current') {
      if (!match) {
        return [
          { kind: 'message', label: 'This folder is not an Envhue environment' },
          { kind: 'message', label: 'Add an environment…', command: 'envhue.addEnvironment' },
          { kind: 'message', label: 'Import from Project Manager…', command: 'envhue.importProjects' }
        ];
      }

      const deadline = getUnlockDeadline(match.environment.id);
      const minutesLeft = deadline === undefined
        ? undefined
        : Math.max(1, Math.ceil((deadline - Date.now()) / 60000));

      return buildEnvironmentRows(
        match.environment,
        isLocked(match.environment),
        isLocked(match.environment) ? undefined : minutesLeft
      ).map(
        (row): Node => ({ kind: 'row', ...row })
      );
    }

    if (environments.length === 0) {
      return [{ kind: 'message', label: 'No environment yet', command: 'envhue.addEnvironment' }];
    }

    return environments
      .slice()
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)
      )
      .map((environment): Node => ({
        kind: 'environment',
        environment,
        current: environment.id === match?.environment.id
      }));
  }
}
