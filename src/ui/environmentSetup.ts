import * as vscode from 'vscode';
import {
  Environment,
  EnvironmentSetup,
  EnvironmentType
} from '../models/environment';
import { EXTENSION_ID_PATTERN } from '../models/normalize';

interface SuggestedExtension {
  id: string;
  description: string;
}

const GITLENS: SuggestedExtension = {
  id: 'eamodio.gitlens',
  description: 'GitLens — Git history and insights'
};

const EXTENSION_PRESETS: Record<EnvironmentType, SuggestedExtension[]> = {
  DEV: [
    { id: 'dbaeumer.vscode-eslint', description: 'ESLint — JavaScript and TypeScript linting' },
    { id: 'esbenp.prettier-vscode', description: 'Prettier — Code formatting' },
    GITLENS
  ],
  TEST: [
    { id: 'orta.vscode-jest', description: 'Jest — Test runner' },
    { id: 'ms-playwright.playwright', description: 'Playwright — Browser testing' },
    GITLENS
  ],
  PREPROD: [
    { id: 'ms-azuretools.vscode-docker', description: 'Docker — Container management' },
    GITLENS
  ],
  PROD: [GITLENS],
  CUSTOM: []
};

export async function configureEnvironmentSetup(
  environment: Environment
): Promise<EnvironmentSetup | undefined> {
  const current = environment.setup;

  const mode = await vscode.window.showQuickPick(
    [
      {
        label: '$(extensions) Recommended extensions',
        description: 'Offer to install a list of extensions when this environment opens',
        value: 'extensions'
      },
      {
        label: '$(layers) Remind me of a VS Code profile',
        description: 'Show a reminder to switch to an existing profile',
        value: 'profile'
      },
      {
        label: '$(circle-slash) No additional configuration',
        description: 'Keep the current VS Code configuration',
        value: 'none'
      }
    ],
    {
      title: `Envhue — Setup ${environment.name}`,
      placeHolder: 'Choose how to configure this environment'
    }
  );

  if (!mode) {
    return undefined;
  }

  if (mode.value === 'none') {
    return { mode: 'none' };
  }

  if (mode.value === 'profile') {
    const profileName = await vscode.window.showInputBox({
      title: 'Envhue — VS Code Profile',
      prompt: 'Enter the exact name of an existing VS Code profile',
      placeHolder: 'For example: Frontend',
      value: current?.profileName ?? '',
      validateInput: (value) =>
        value.trim() ? undefined : 'Profile name is required.'
    });

    return profileName
      ? { mode: 'profile', profileName: profileName.trim() }
      : undefined;
  }

  const extensionMap = new Map<string, SuggestedExtension>(
    EXTENSION_PRESETS[environment.type].map((item) => [item.id.toLowerCase(), item])
  );

  // Keep custom extension IDs already saved on the environment.
  for (const id of current?.extensions ?? []) {
    if (!extensionMap.has(id.toLowerCase())) {
      extensionMap.set(id.toLowerCase(), { id, description: 'Custom extension' });
    }
  }

  const selected = await vscode.window.showQuickPick(
    [...extensionMap.values()].map((item) => ({
      label: item.id,
      description: item.description,
      picked: current?.extensions?.some(
        (id) => id.toLowerCase() === item.id.toLowerCase()
      ) ?? false
    })),
    {
      title: `Envhue — Extensions for ${environment.name}`,
      placeHolder: 'Select the extensions to recommend',
      canPickMany: true,
      ignoreFocusOut: true
    }
  );

  if (!selected) {
    return undefined;
  }

  const extensions = selected.map((item) => item.label);

  const customIds = await vscode.window.showInputBox({
    title: 'Envhue — Additional Extensions',
    prompt: 'Optionally enter more extension IDs, separated by commas',
    placeHolder: 'publisher.extension, publisher.extension'
  });

  if (customIds === undefined) {
    return undefined;
  }

  for (const rawId of customIds.split(',')) {
    const id = rawId.trim();

    if (!id) {
      continue;
    }

    if (!EXTENSION_ID_PATTERN.test(id)) {
      void vscode.window.showErrorMessage(
        `Invalid extension ID: ${id}. Expected publisher.extension.`
      );
      return undefined;
    }

    if (!extensions.some((existing) => existing.toLowerCase() === id.toLowerCase())) {
      extensions.push(id);
    }
  }

  return { mode: 'extensions', extensions };
}

async function showProfileReminder(
  environment: Environment,
  profileName: string
): Promise<void> {
  // VS Code offers no API to switch profile from an extension, so we can
  // only remind the user and open the native profile switcher.
  const action = await vscode.window.showInformationMessage(
    `"${environment.name}" is meant to be used with the VS Code profile "${profileName}".`,
    'Switch Profile…',
    'Later'
  );

  if (action !== 'Switch Profile…') {
    return;
  }

  try {
    await vscode.commands.executeCommand('workbench.profiles.actions.switchProfile');
  } catch {
    await vscode.commands.executeCommand('workbench.action.showCommands');
  }
}

export async function applyEnvironmentSetup(
  environment: Environment
): Promise<void> {
  const setup = environment.setup;

  if (!setup || setup.mode === 'none') {
    return;
  }

  if (setup.mode === 'profile') {
    if (setup.profileName) {
      await showProfileReminder(environment, setup.profileName);
    }
    return;
  }

  const extensionIds = [
    ...new Set(
      (setup.extensions ?? [])
        .map((id) => id.trim())
        .filter((id) => EXTENSION_ID_PATTERN.test(id))
        .map((id) => id.toLowerCase())
    )
  ];

  const installed = new Set(
    vscode.extensions.all.map((extension) => extension.id.toLowerCase())
  );

  const missing = extensionIds.filter((id) => !installed.has(id));

  if (missing.length === 0) {
    return;
  }

  const action = await vscode.window.showWarningMessage(
    `${missing.length} recommended extension(s) are missing for "${environment.name}". ` +
    'Extensions are installed globally in VS Code, not only for this environment.',
    'Install Extensions',
    'Later'
  );

  if (action !== 'Install Extensions') {
    return;
  }

  const failures: string[] = [];

  for (const id of missing) {
    try {
      await vscode.commands.executeCommand('workbench.extensions.installExtension', id);
    } catch (error) {
      failures.push(id);
      console.error(`[Envhue] Could not install ${id}:`, error);
    }
  }

  if (failures.length > 0) {
    void vscode.window.showErrorMessage(
      `Envhue could not install: ${failures.join(', ')}.`
    );
  } else {
    void vscode.window.showInformationMessage(
      `Envhue started installing ${missing.length} extension(s). Check progress in VS Code.`
    );
  }
}
