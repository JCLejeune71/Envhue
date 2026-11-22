import { describeTarget } from './describe';
import { Environment } from './environment';

// Pure module (no "vscode" import) so that it can be unit-tested.
// Describes the rows of the Envhue side panel for the current environment.

export interface PanelRow {
  id: string;
  label: string;
  description: string;
  tooltip: string;
  /** Codicon name, without the $( ) wrapper. */
  icon: string;
  command: string;
}

const onOff = (value: boolean): string => (value ? 'On' : 'Off');

export function buildEnvironmentRows(
  environment: Environment,
  locked: boolean,
  /** Minutes before a temporary unlock ends, when there is one. */
  unlockMinutesLeft?: number
): PanelRow[] {
  const isProd = environment.type === 'PROD';

  return [
    {
      id: 'name',
      label: 'Name',
      description: environment.name,
      tooltip: 'Rename this environment',
      icon: 'edit',
      command: 'envhue.panel.rename'
    },
    {
      id: 'client',
      label: 'Client',
      description: environment.client ?? 'none',
      tooltip: 'Change the client or project name',
      icon: 'organization',
      command: 'envhue.panel.setClient'
    },
    {
      id: 'type',
      label: 'Type',
      description: environment.type,
      tooltip: 'Change the category (DEV, TEST, PREPROD, PROD, CUSTOM)',
      icon: isProd ? 'warning' : 'layers',
      command: 'envhue.panel.setType'
    },
    {
      id: 'colors',
      label: 'Colors',
      description: environment.colors.accent,
      tooltip: 'Change the accent color and the other colors',
      icon: 'symbol-color',
      command: 'envhue.editColors'
    },
    {
      id: 'confirmation',
      label: 'Confirm before opening',
      description: isProd ? 'On (always for PROD)' : onOff(environment.requireConfirmation),
      tooltip: 'Ask for confirmation before this environment is opened',
      icon: 'question',
      command: 'envhue.panel.toggleConfirmation'
    },
    {
      id: 'readOnlyDefault',
      label: 'Read-only by default',
      description: onOff(environment.readOnly),
      tooltip: 'Open this environment locked every time',
      icon: 'lock',
      command: 'envhue.panel.toggleReadOnlyDefault'
    },
    {
      id: 'lock',
      label: 'Lock this session',
      description: locked
        ? 'Locked'
        : unlockMinutesLeft !== undefined
          ? `Unlocked (${unlockMinutesLeft} min left)`
          : 'Unlocked',
      tooltip: 'Lock or unlock the files for this window session only',
      icon: locked ? 'lock' : 'unlock',
      command: 'envhue.toggleReadOnly'
    },
    {
      id: 'favorite',
      label: 'Favorite',
      description: onOff(environment.favorite),
      tooltip: 'Show this environment first in the picker',
      icon: environment.favorite ? 'star-full' : 'star-empty',
      command: 'envhue.panel.toggleFavorite'
    },
    {
      id: 'location',
      label: 'Location',
      description: describeTarget(environment),
      tooltip: 'Change the path, host or connection of this environment',
      icon: 'remote',
      command: 'envhue.panel.editLocation'
    }
  ];
}
