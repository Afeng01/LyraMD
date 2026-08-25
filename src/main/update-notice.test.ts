import { describe, expect, it } from 'vitest'
import {
  EMPTY_RELEASE_NOTICE_STATE,
  isUpdateVersionSkipped,
  parseReleaseNoticeState,
  serializeReleaseNoticeState,
  shouldShowReleaseNoticeOnLaunch,
  withReleaseNoticeShown,
  withSkippedUpdateVersion,
} from './update-notice'

describe('update notice pure logic', () => {
  it('parses persisted release notice json defensively', () => {
    expect(parseReleaseNoticeState(null)).toEqual(EMPTY_RELEASE_NOTICE_STATE)
    expect(parseReleaseNoticeState('nonsense')).toEqual(EMPTY_RELEASE_NOTICE_STATE)
    expect(parseReleaseNoticeState([1, 2])).toEqual(EMPTY_RELEASE_NOTICE_STATE)
    expect(parseReleaseNoticeState({ skippedVersion: '1.3.9', lastShownVersion: '1.3.8' })).toEqual({
      skippedVersion: '1.3.9',
      lastShownVersion: '1.3.8',
    })
    expect(parseReleaseNoticeState({ skippedVersion: '   ', lastShownVersion: 42 })).toEqual(EMPTY_RELEASE_NOTICE_STATE)
  })

  it('suppresses banners only for the exact skipped version', () => {
    let state = withSkippedUpdateVersion(EMPTY_RELEASE_NOTICE_STATE, '1.3.9')
    expect(isUpdateVersionSkipped(state, '1.3.9')).toBe(true)
    expect(isUpdateVersionSkipped(state, '1.4.0')).toBe(false)

    // 跳过只保留最近一个版本，新版本重新提醒
    state = withSkippedUpdateVersion(state, '1.4.0')
    expect(isUpdateVersionSkipped(state, '1.3.9')).toBe(false)
    expect(isUpdateVersionSkipped(state, '1.4.0')).toBe(true)

    // 空版本号不改变状态
    expect(withSkippedUpdateVersion(state, '   ')).toBe(state)
  })

  it('opens the release notes pane once per app version', () => {
    const shown = withReleaseNoticeShown(EMPTY_RELEASE_NOTICE_STATE, '1.3.8')
    expect(shouldShowReleaseNoticeOnLaunch(shown, '1.3.8')).toBe(false)
    expect(shouldShowReleaseNoticeOnLaunch(shown, '1.3.9')).toBe(true)
    expect(shouldShowReleaseNoticeOnLaunch(EMPTY_RELEASE_NOTICE_STATE, '1.3.8')).toBe(true)
  })

  it('serializes back to valid json', () => {
    const state = withReleaseNoticeShown(withSkippedUpdateVersion(EMPTY_RELEASE_NOTICE_STATE, '1.3.9'), '1.3.8')
    expect(parseReleaseNoticeState(JSON.parse(serializeReleaseNoticeState(state)))).toEqual(state)
  })
})
