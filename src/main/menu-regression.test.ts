import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('application menu shortcut regression', () => {
  it('uses persisted shortcuts for customizable menu accelerators', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain("shortcutFor('save')")
    expect(main).toContain("shortcutFor('saveAs')")
    expect(main).toContain("shortcutFor('settings')")
    expect(main).toContain("shortcutFor('search')")
    expect(main).toContain("shortcutFor('toggleSidebar')")
    expect(main).toContain("shortcutFor('toggleOutline')")
    expect(main).toContain("shortcutFor('cleanCjkTypography')")
  })

  it('rebuilds the menu after settings shortcuts change', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(main).toContain('buildMenu()')
    expect(main).toContain('appSettings = await updateAppSettings')
  })
})
