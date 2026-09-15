// 设置里「更新日志」分页的数据源：直接解析仓库根的 CHANGELOG.md，
// 避免手写静态卡片与 CHANGELOG 双份维护漂移（同导出 HTML 样式的教训）。
import changelogRaw from '../../CHANGELOG.md?raw'

export interface ChangelogBlock {
  kind: 'group' | 'paragraphs'
  title: string | null
  lines: string[]
}

export interface ChangelogRelease {
  version: string
  note: string
  blocks: ChangelogBlock[]
}

export interface ChangelogListItem {
  bold: string | null
  rest: string
}

// 「**标题**：描述」→ 标题与描述分开渲染
export function splitLeadingBold(text: string): ChangelogListItem {
  const match = /^\*\*(.+?)\*\*[:：]\s*(.*)$/.exec(text.trim())
  if (!match) return { bold: null, rest: text.trim() }
  return { bold: match[1], rest: match[2] }
}

function splitVersionHeading(text: string): { version: string; note: string } {
  const match = /^(.+?)（([^（）]*)）\s*$/.exec(text.trim())
  if (!match) return { version: text.trim(), note: '' }
  return { version: match[1].trim(), note: match[2].trim() }
}

export function parseChangelog(raw: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  let current: ChangelogRelease | null = null
  let pendingGroup: ChangelogBlock | null = null

  const flushGroup = (): void => {
    if (current && pendingGroup && pendingGroup.lines.length > 0) {
      current.blocks.push(pendingGroup)
    }
    pendingGroup = null
  }

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trimEnd()
    if (line.startsWith('## ')) {
      flushGroup()
      const { version, note } = splitVersionHeading(line.slice(3))
      current = { version, note, blocks: [] }
      releases.push(current)
      continue
    }
    if (!current) continue // 版本线说明等前言，不进应用内渲染
    if (line.startsWith('### ')) {
      flushGroup()
      pendingGroup = { kind: 'group', title: line.slice(4).trim(), lines: [] }
      continue
    }
    if (line.startsWith('- ')) {
      if (!pendingGroup) pendingGroup = { kind: 'group', title: null, lines: [] }
      pendingGroup.lines.push(line.slice(2).trim())
      continue
    }
    if (line.trim().length > 0 && !line.startsWith('#')) {
      flushGroup()
      const paragraphBlock: ChangelogBlock = { kind: 'paragraphs', title: null, lines: [line.trim()] }
      current.blocks.push(paragraphBlock)
    }
  }
  flushGroup()
  return releases
}

export const changelogReleases: ChangelogRelease[] = parseChangelog(changelogRaw)
