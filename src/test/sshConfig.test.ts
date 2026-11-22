import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseSshConfig } from '../models/sshConfig';

test('hosts are listed with their HostName and User', () => {
  const { hosts } = parseSshConfig(`
Host staging
  HostName staging.example.com
  User deploy

Host prod
  HostName 10.0.0.5
`);

  assert.deepEqual(hosts, [
    { alias: 'staging', hostName: 'staging.example.com', user: 'deploy' },
    { alias: 'prod', hostName: '10.0.0.5' }
  ]);
});

test('wildcard and negated patterns are skipped', () => {
  const { hosts } = parseSshConfig(`
Host *
  User everyone
Host *.internal !bastion web?
  User ignored
Host real
  HostName real.example.com
`);

  assert.deepEqual(hosts, [{ alias: 'real', hostName: 'real.example.com' }]);
});

test('several aliases on one Host line share their settings', () => {
  const { hosts } = parseSshConfig('Host a b "c d"\n  User shared\n');

  assert.deepEqual(hosts.map((host) => host.alias), ['a', 'b', 'c d']);
  assert.ok(hosts.every((host) => host.user === 'shared'));
});

test('keywords are case-insensitive and "=" is accepted', () => {
  const { hosts } = parseSshConfig('host=Lab\n  hostname = lab.local\n  USER=root\n');

  assert.deepEqual(hosts, [{ alias: 'Lab', hostName: 'lab.local', user: 'root' }]);
});

test('comments, blank lines and CRLF line endings are handled', () => {
  const { hosts } = parseSshConfig(
    '# my hosts\r\n\r\nHost one # trailing\r\n  HostName one.example.com\r\n'
  );

  assert.deepEqual(hosts, [{ alias: 'one', hostName: 'one.example.com' }]);
});

test('settings after a Match block are not attached to the previous host', () => {
  const { hosts } = parseSshConfig(`
Host first
  HostName first.example.com
Match user admin
  HostName other.example.com
`);

  assert.deepEqual(hosts, [{ alias: 'first', hostName: 'first.example.com' }]);
});

test('the first value obtained for a setting wins', () => {
  const { hosts } = parseSshConfig(`
Host dup
  HostName first.example.com
Host dup
  HostName second.example.com
  User added
`);

  assert.deepEqual(hosts, [
    { alias: 'dup', hostName: 'first.example.com', user: 'added' }
  ]);
});

test('an empty or unusable config gives no hosts and no includes', () => {
  assert.deepEqual(parseSshConfig(''), { hosts: [], includes: [] });
  assert.deepEqual(parseSshConfig('Host *\n  ForwardAgent yes\n'), {
    hosts: [],
    includes: []
  });
});

test('Include directives are returned for the caller to resolve', () => {
  const { includes, hosts } = parseSshConfig(`
Include config.d/*
include ~/.ssh/work "my file"
Host a
`);

  assert.deepEqual(includes, ['config.d/*', '~/.ssh/work', 'my file']);
  assert.deepEqual(hosts, [{ alias: 'a' }]);
});
