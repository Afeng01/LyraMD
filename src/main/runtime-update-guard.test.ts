import { describe, expect, it } from 'vitest'
import { shouldPromptForInstalledBundleRefresh } from './runtime-update-guard'

describe('runtime update guard', () => {
  it('only prompts for packaged apps whose bundle changed after launch', () => {
    expect(shouldPromptForInstalledBundleRefresh({
      bundleMtimeMs: 2_000,
      currentLaunchTimeMs: 1_000,
      isPackaged: true,
      toleranceMs: 100,
    })).toBe(true)

    expect(shouldPromptForInstalledBundleRefresh({
      bundleMtimeMs: 1_050,
      currentLaunchTimeMs: 1_000,
      isPackaged: true,
      toleranceMs: 100,
    })).toBe(false)

    expect(shouldPromptForInstalledBundleRefresh({
      bundleMtimeMs: 2_000,
      currentLaunchTimeMs: 1_000,
      isPackaged: false,
      toleranceMs: 100,
    })).toBe(false)

    expect(shouldPromptForInstalledBundleRefresh({
      bundleMtimeMs: null,
      currentLaunchTimeMs: 1_000,
      isPackaged: true,
      toleranceMs: 100,
    })).toBe(false)
  })
})
