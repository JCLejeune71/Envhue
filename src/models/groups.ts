import { Environment } from './environment';

// Pure module (no "vscode" import) so that it can be unit-tested.

export interface ClientGroup {
  /** Empty string for environments without a client. */
  client: string;
  environments: Environment[];
}

const byFavoriteThenName = (a: Environment, b: Environment): number =>
  Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name);

/**
 * Groups environments by client (case-insensitive), clients in alphabetical
 * order and the environments without a client last. Inside a group, favorites
 * come first.
 */
export function groupByClient(environments: Environment[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();

  for (const environment of environments) {
    const client = environment.client?.trim() ?? '';
    const key = client.toLowerCase();
    const group = groups.get(key) ?? { client, environments: [] };

    group.environments.push(environment);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({ ...group, environments: group.environments.sort(byFavoriteThenName) }))
    .sort((a, b) =>
      Number(a.client === '') - Number(b.client === '') ||
      a.client.localeCompare(b.client)
    );
}
