import * as vscode from 'vscode';
import { Environment } from '../models/environment';
import { normalizeEnvironment } from '../models/normalize';
import { log } from './log';

const SECTION = 'envhue';
const KEY = 'environments';

export class EnvironmentService {
  private getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SECTION);
  }

  getAll(): Environment[] {
    const config = this.getConfiguration();
    const globalValue = config.inspect<unknown[]>(KEY)?.globalValue;
    const raw = Array.isArray(globalValue)
      ? globalValue
      : config.get<unknown[]>(KEY, []);

    return raw
      .map((item) => normalizeEnvironment(item))
      .filter((item): item is Environment => item !== undefined);
  }

  async saveAll(environments: Environment[]): Promise<void> {
    log(`settings: saving ${environments.length} environment(s)`);
    await this.getConfiguration().update(
      KEY,
      environments,
      vscode.ConfigurationTarget.Global
    );
  }

  async add(environment: Environment): Promise<void> {
    const environments = this.getAll();
    environments.push(environment);
    await this.saveAll(environments);
  }

  async update(environment: Environment): Promise<void> {
    const environments = this.getAll();
    const index = environments.findIndex((item) => item.id === environment.id);

    if (index < 0) {
      throw new Error(`Environment "${environment.name}" was not found.`);
    }

    environments[index] = environment;
    await this.saveAll(environments);
  }

  async remove(id: string): Promise<void> {
    await this.saveAll(this.getAll().filter((item) => item.id !== id));
  }
}
