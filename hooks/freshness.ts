// Is this dashboard behind GitHub? An install (`/plugin install`) records the
// commit it came from; that is compared with the newest commit on main. A copy
// loaded from a folder has no such record, so its version is compared with
// the version main's manifest declares instead.

export const REMOTE_SHA_URL = 'https://api.github.com/repos/egan-wu/slime-dashboard/commits/main'
export const REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/egan-wu/slime-dashboard/main/.claude-plugin/plugin.json'

type InstallRecord = { gitCommitSha?: string; lastUpdated?: string }

// The commit of the newest install of `pluginId` in installed_plugins.json's
// text; undefined when it is not installed or the text does not parse.
export function installedSha(recordText: string, pluginId: string): string | undefined {
  try {
    const records = (JSON.parse(recordText) as { plugins?: Record<string, InstallRecord[]> }).plugins?.[pluginId] ?? []
    const newest = [...records].sort((a, b) => (b.lastUpdated ?? '').localeCompare(a.lastUpdated ?? ''))[0]
    return newest?.gitCommitSha
  } catch {
    return undefined
  }
}

// GitHub answers a bare commit hash when asked for `application/vnd.github.sha`.
export function remoteSha(text: string): string | undefined {
  const sha = text.trim()
  return /^[0-9a-f]{40}$/.test(sha) ? sha : undefined
}

export function manifestVersion(text: string): string | undefined {
  try {
    const version = (JSON.parse(text) as { version?: unknown }).version
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
}
