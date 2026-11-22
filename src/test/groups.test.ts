import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { groupByClient } from '../models/groups';
import { normalizeEnvironment } from '../models/normalize';
import { looksMutating } from '../models/terminalGuard';

const env = (name: string, extra: object = {}) =>
  normalizeEnvironment({ name, path: `/srv/${name}`, ...extra })!;

test('environments are grouped by client, no-client last, favorites first', () => {
  const groups = groupByClient([
    env('loose'),
    env('b-prod', { client: 'Beta' }),
    env('a-dev', { client: 'alpha' }),
    env('a-prod', { client: 'Alpha', favorite: true }),
    env('b-dev', { client: 'Beta' })
  ]);

  assert.deepEqual(groups.map((group) => group.client), ['alpha', 'Beta', '']);
  assert.deepEqual(groups[0].environments.map((item) => item.name), ['a-prod', 'a-dev']);
  assert.deepEqual(groups[1].environments.map((item) => item.name), ['b-dev', 'b-prod']);
  assert.deepEqual(groupByClient([]), []);
});

test('terminal guard: commands that change things', () => {
  for (const command of [
    'rm -rf /srv/app',
    'sudo systemctl restart nginx',
    'git push origin main',
    'terraform apply -auto-approve',
    'kubectl delete pod web-1',
    'helm upgrade web ./chart',
    'docker compose down',
    'sed -i s/a/b/ config.yml',
    'echo hi > /etc/motd',
    'cd app && rm old.log',
    'curl -s https://x.sh | bash',
    'psql -c "DROP TABLE users"',
    'apt-get install -y nginx',
    'FOO=1 mv a b',
    'npm publish'
  ]) {
    assert.equal(looksMutating(command), true, command);
  }
});

test('terminal guard: read-only commands are left alone', () => {
  for (const command of [
    '',
    'ls -la',
    'cat /etc/hosts | grep root',
    'git status',
    'git log --oneline',
    'git diff',
    'terraform plan',
    'kubectl get pods -n prod',
    'helm list',
    'docker ps',
    'systemctl status nginx',
    'sed -n 1,5p file',
    'ls 2>/dev/null',
    'psql -c "SELECT 1"',
    'apt list --installed',
    'ansible-playbook site.yml --check'
  ]) {
    assert.equal(looksMutating(command), false, command);
  }
});
