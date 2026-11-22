export type EnvironmentType = 'DEV' | 'TEST' | 'PREPROD' | 'PROD' | 'CUSTOM';
/**
 * - local: a folder on this machine
 * - ssh: a folder on a host reached through Remote - SSH
 * - wsl: a folder inside a WSL distribution (Remote - WSL)
 * - devcontainer: a local folder with a dev container configuration, reopened
 *   in its container (Dev Containers)
 */
export type ConnectionType = 'local' | 'ssh' | 'wsl' | 'devcontainer';

export interface EnvironmentColors {
  /** Main identity color: title bar, activity bar, status bar. */
  accent: string;
  /** Editor, panel and terminal background. */
  background: string;
  /** Side bar background. */
  sidebar: string;
  /** Text and icons drawn on top of the accent color. */
  text: string;
}

export type EnvironmentSetupMode = 'extensions' | 'profile' | 'none';

export interface EnvironmentSetup {
  mode: EnvironmentSetupMode;
  extensions?: string[];
  profileName?: string;
}

export interface Environment {
  id: string;
  name: string;
  client?: string;
  type: EnvironmentType;
  connection: ConnectionType;
  path: string;
  /** SSH host or alias (connection "ssh"). */
  server?: string;
  /** WSL distribution name (connection "wsl"). */
  distro?: string;
  colors: EnvironmentColors;
  requireConfirmation: boolean;
  /**
   * Opens the environment in read-only mode: the files of the workspace are
   * marked read-only until the user unlocks them for the session.
   */
  readOnly: boolean;
  favorite: boolean;
  setup?: EnvironmentSetup;
}

/** Properties of the earlier (PowerShell launcher) format. */
export interface LegacyEnvironment {
  Nom?: string;
  Dossier?: string;
  Serveur?: string;
  Accent?: string;
  Fond?: string;
  Lateral?: string;
  Texte?: string;
  Confirmer?: boolean;
  [key: string]: unknown;
}

export const ENVIRONMENT_TYPES: EnvironmentType[] = [
  'DEV',
  'TEST',
  'PREPROD',
  'PROD',
  'CUSTOM'
];

export const CONNECTION_TYPES: ConnectionType[] = [
  'local',
  'ssh',
  'wsl',
  'devcontainer'
];

/** Single source of truth for every accent color used by the extension. */
export const ACCENT_PALETTE = {
  green: '#2E7D32',
  lightGreen: '#95ED9B',
  teal: '#00897B',
  blue: '#2196D2',
  purple: '#7952B3',
  yellow: '#D6A928',
  orange: '#D97706',
  red: '#B91C1C',
  gray: '#546E7A'
} as const;

/** Colors offered in the "Change Colors" picker, in display order. */
export const ACCENT_PRESETS: ReadonlyArray<{ label: string; color: string }> = [
  { label: 'Green', color: ACCENT_PALETTE.green },
  { label: 'Light green', color: ACCENT_PALETTE.lightGreen },
  { label: 'Teal', color: ACCENT_PALETTE.teal },
  { label: 'Blue', color: ACCENT_PALETTE.blue },
  { label: 'Purple', color: ACCENT_PALETTE.purple },
  { label: 'Yellow', color: ACCENT_PALETTE.yellow },
  { label: 'Orange', color: ACCENT_PALETTE.orange },
  { label: 'Red', color: ACCENT_PALETTE.red },
  { label: 'Gray', color: ACCENT_PALETTE.gray }
];

export const DEFAULT_ACCENT_BY_TYPE: Record<EnvironmentType, string> = {
  DEV: ACCENT_PALETTE.yellow,
  TEST: ACCENT_PALETTE.blue,
  PREPROD: ACCENT_PALETTE.orange,
  PROD: ACCENT_PALETTE.red,
  CUSTOM: ACCENT_PALETTE.purple
};

/** Example color shown in prompts and error messages. */
export const COLOR_EXAMPLE = ACCENT_PALETTE.yellow;
