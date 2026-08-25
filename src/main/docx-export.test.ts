import { describe, expect, it, vi } from 'vitest'

// docx-export 只在导出图片时触碰 Electron nativeImage；单测环境用空图兜底，
// 让相对/绝对路径都走占位段落分支
vi.mock('electron', () => ({
  nativeImage: {
    createFromPath: () => ({
      isEmpty: () => true,
      getSize: () => ({ width: 1, height: 1 }),
      toPNG: () => new Uint8Array(),
    }),
  },
}))

import { markdownToDocx } from './docx-export'

const SAMPLE = [
  '# LyraMD 导出测试',
  '',
  '正文 **加粗** *斜体* ~~删除~~ `inline code` [链接](https://example.com)',
  '',
  '> 一段引用',
  '',
  '- 无序一',
  '- 无序二',
  '',
  '1. 有序一',
  '2. 有序二',
  '',
  '| 列A | 列B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '```ts',
  'const answer = 42',
  '```',
  '',
  '![缺失图片](./does-not-exist.png)',
  '',
  '---',
].join('\n')

describe('docx-export', () => {
  it('converts markdown into a docx zip buffer with a PK header', async () => {
    const buffer = await markdownToDocx({ content: SAMPLE, sourcePath: null })

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
    // docx 是 zip 容器：本地文件头签名 "PK\x03\x04"
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
  })

  it('falls back to a placeholder for unreadable images next to the source file', async () => {
    const buffer = await markdownToDocx({
      content: '![图](./assets/nope.png)\n\n正文',
      sourcePath: '/tmp/lyramd-fixture.md',
    })

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
  })
})
