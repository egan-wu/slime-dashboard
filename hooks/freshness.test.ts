import { expect, test } from 'claude-code/testing'

import { installedSha, manifestVersion, remoteSha } from './freshness'

const RECORD = JSON.stringify({
  version: 2,
  plugins: {
    'slime-dashboard@slime-dashboard': [
      { scope: 'project', gitCommitSha: 'a'.repeat(40), lastUpdated: '2026-10-07T17:44:19.316Z' },
      { scope: 'user', gitCommitSha: 'b'.repeat(40), lastUpdated: '2026-10-08T09:00:00.000Z' },
    ],
  },
})

test('the newest install of the dashboard names its commit', async () => {
  expect(installedSha(RECORD, 'slime-dashboard@slime-dashboard')).toBe('b'.repeat(40))
  expect(installedSha(RECORD, 'other@elsewhere')).toBeUndefined()
  expect(installedSha('not json', 'slime-dashboard@slime-dashboard')).toBeUndefined()
})

test("GitHub's answers: a bare commit hash, and the manifest's version", async () => {
  expect(remoteSha(`${'c'.repeat(40)}\n`)).toBe('c'.repeat(40))
  expect(remoteSha('{"message":"API rate limit exceeded"}')).toBeUndefined()
  expect(manifestVersion('{"name":"slime-dashboard","version":"0.3.0"}')).toBe('0.3.0')
  expect(manifestVersion('404: Not Found')).toBeUndefined()
})
