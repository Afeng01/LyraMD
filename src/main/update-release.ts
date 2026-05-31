export const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/Afeng01/LyraMD/releases/latest'
export const GITHUB_RELEASES_URL = 'https://github.com/Afeng01/LyraMD/releases'

export interface GitHubReleaseAsset {
  browser_download_url: string
  name: string
}

export interface GitHubReleaseInfo {
  assets: GitHubReleaseAsset[]
  html_url: string
  name: string | null
  prerelease: boolean
  tag_name: string
}

export interface MacManualUpdateInfo {
  downloadUrl: string | null
  releaseUrl: string
  version: string
}

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  json: () => Promise<unknown>
  ok: boolean
  status: number
}>

function parseVersion(version: string): number[] | null {
  const match = version.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return match.slice(1).map((part) => Number.parseInt(part, 10))
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate)
  const active = parseVersion(current)
  if (!next || !active) return false

  for (let index = 0; index < Math.max(next.length, active.length); index += 1) {
    const left = next[index] ?? 0
    const right = active[index] ?? 0
    if (left > right) return true
    if (left < right) return false
  }

  return false
}

export function findMacDmgAsset(assets: GitHubReleaseAsset[], arch: NodeJS.Architecture = process.arch): GitHubReleaseAsset | null {
  const dmgAssets = assets.filter((asset) => asset.name.endsWith('.dmg'))
  if (dmgAssets.length === 0) return null

  const archAsset = dmgAssets.find((asset) => asset.name.includes(`-${arch}.`))
  return archAsset ?? dmgAssets[0]
}

function isGitHubReleaseInfo(candidate: unknown): candidate is GitHubReleaseInfo {
  const release = candidate as Partial<GitHubReleaseInfo>
  return !!release
    && typeof release.tag_name === 'string'
    && typeof release.html_url === 'string'
    && Array.isArray(release.assets)
}

export async function fetchLatestMacManualUpdate(
  currentVersion: string,
  fetchImpl: FetchLike = fetch,
): Promise<MacManualUpdateInfo | null> {
  const response = await fetchImpl(GITHUB_LATEST_RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `LyraMD/${currentVersion}`,
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub Releases request failed: HTTP ${response.status}`)
  }

  const payload = await response.json()
  if (!isGitHubReleaseInfo(payload)) {
    throw new Error('GitHub Releases response did not include a valid release payload')
  }

  if (payload.prerelease || !isNewerVersion(payload.tag_name, currentVersion)) {
    return null
  }

  const dmgAsset = findMacDmgAsset(payload.assets)

  return {
    downloadUrl: dmgAsset?.browser_download_url ?? null,
    releaseUrl: payload.html_url || GITHUB_RELEASES_URL,
    version: payload.tag_name.replace(/^v/i, ''),
  }
}
