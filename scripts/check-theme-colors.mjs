// 主题颜色契约检查：九个内置主题（light/dark/elegant/newsprint/mist/sand/pine/rosewood/terminal）的语义色
// 必须同时满足——
//   1) base.css 内置块与 themes/*.css 独立文件的 token 值完全一致；
//   2) 正文弱化文字（--text-muted）和链接（--link-color）对各自底色的
//      对比度达到 WCAG AA（≥ 4.5）；
//   3) 自定义主题按「默认值回退 + 局部覆盖」合并时，变量覆盖生效、
//      直接元素选择器不会污染 token。
// 运行：npm run check:themes
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const dirProject = process.cwd()
const pathBase = path.join(dirProject, 'src/renderer/themes/base.css')
const dirThemes = path.join(dirProject, 'themes')

const textBase = fs.readFileSync(pathBase, 'utf8')

const expectedThemes = {
  light: {
    'bg-color': '#ffffff',
    'link-color': '#0969da',
    'text-color': '#24292f',
    'text-muted': '#656d76',
  },
  dark: {
    'bg-color': '#0d1117',
    'link-color': '#58a6ff',
    'text-color': '#e6edf3',
    'text-muted': '#8b949e',
  },
  // #6c6c6c / #bc4424 是对 #f0edea 底色做过 WCAG AA 校准的值，
  // 旧的 #777 / #c44b2b 分别只有 3.84 / 4.10，不达标。
  elegant: {
    'bg-color': '#f0edea',
    'link-color': '#bc4424',
    'text-color': '#2c2c2c',
    'text-muted': '#6c6c6c',
  },
  newsprint: {
    'bg-color': '#f5f2eb',
    'link-color': '#2c5f8a',
    'text-color': '#1a1a1a',
    'text-muted': '#666666',
  },
  mist: {
    'bg-color': '#f2f5f7',
    'link-color': '#2e6589',
    'text-color': '#2b3440',
    'text-muted': '#5d6b78',
  },
  sand: {
    'bg-color': '#f8f2e7',
    'link-color': '#8f5220',
    'text-color': '#453a2c',
    'text-muted': '#7a6d5a',
  },
  pine: {
    'bg-color': '#101a15',
    'link-color': '#7cc79b',
    'text-color': '#d9e4dc',
    'text-muted': '#93a89a',
  },
  rosewood: {
    'bg-color': '#1d1512',
    'link-color': '#d99a62',
    'text-color': '#ecdfd4',
    'text-muted': '#a8978a',
  },
  terminal: {
    'bg-color': '#0f100e',
    'link-color': '#6b9e52',
    'text-color': '#acb09f',
    'text-muted': '#798173',
    'theme-editor-font-family': '"jetbrains mono", "ibm plex mono", "cascadia code", ui-monospace, sfmono-regular, menlo, monaco, consolas, "courier new", monospace',
  },
}

function normalizeHex(value) {
  const hex = value.trim().replace(/^#/, '')
  if (hex.length === 3) return `#${hex.split('').map((channel) => channel + channel).join('')}`
  return `#${hex}`
}

function getVariables(textBlock) {
  const valuesToken = {}
  const patternToken = /--([a-z-]+):\s*([^;]+);/g

  for (const matchToken of textBlock.matchAll(patternToken)) {
    const value = matchToken[2].trim().toLowerCase()
    // 十六进制统一展开成六位，方便跨文件比较与对比度计算
    valuesToken[matchToken[1]] = /^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(value)
      ? normalizeHex(value)
      : value
  }

  return valuesToken
}

function getBuiltInTheme(nameTheme) {
  const patternTheme = new RegExp(
    `body(?:,\\s*body)?\\.theme-${nameTheme}\\s*\\{([^}]+)\\}`,
  )
  const matchTheme = textBase.match(patternTheme)
  assert.ok(matchTheme, `base.css 缺少内置主题块：${nameTheme}`)
  return getVariables(matchTheme[1])
}

function getStandaloneTheme(nameTheme) {
  const pathTheme = path.join(dirThemes, `${nameTheme}.css`)
  const textTheme = fs.readFileSync(pathTheme, 'utf8')
  const matchRoot = textTheme.match(/:root\s*\{([^}]+)\}/)
  assert.ok(matchRoot, `${nameTheme}.css 缺少 :root 变量块`)
  return getVariables(matchRoot[1])
}

function getDefaultTheme() {
  const valuesBuiltIn = getBuiltInTheme('light')
  assert.ok(valuesBuiltIn['bg-color'], 'Light 默认值必须提供 :root token 基线')
  return valuesBuiltIn
}

function getCustomTheme(textCustom) {
  return {
    ...getDefaultTheme(),
    ...getVariables(textCustom),
  }
}

function getRelativeLuminance(valueHex) {
  const valuesRgb = normalizeHex(valueHex).slice(1).match(/.{2}/g)
  assert.ok(valuesRgb, `无效的十六进制颜色：${valueHex}`)
  const valuesLinear = valuesRgb.map((valueChannel) => {
    const valueSrgb = Number.parseInt(valueChannel, 16) / 255
    return valueSrgb <= 0.04045 ? valueSrgb / 12.92 : ((valueSrgb + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * valuesLinear[0]
    + 0.7152 * valuesLinear[1]
    + 0.0722 * valuesLinear[2]
}

function getContrastRatio(valueForeground, valueBackground) {
  const luminanceForeground = getRelativeLuminance(valueForeground)
  const luminanceBackground = getRelativeLuminance(valueBackground)
  const luminanceLight = Math.max(luminanceForeground, luminanceBackground)
  const luminanceDark = Math.min(luminanceForeground, luminanceBackground)
  return (luminanceLight + 0.05) / (luminanceDark + 0.05)
}

// themes/ 目录只允许存在 expectedThemes 列出的内置主题文件，防止再次出现没人引用的孤儿主题
const filesStandalone = fs.readdirSync(dirThemes)
  .filter((file) => file.endsWith('.css'))
  .sort()
assert.deepEqual(
  filesStandalone,
  Object.keys(expectedThemes).map((name) => `${name}.css`).sort(),
  'themes/ 目录必须且只能包含 expectedThemes 列出的内置主题文件，防止出现没人引用的孤儿主题',
)

for (const [nameTheme, valuesExpected] of Object.entries(expectedThemes)) {
  const valuesBuiltIn = getBuiltInTheme(nameTheme)
  const valuesStandalone = getStandaloneTheme(nameTheme)

  for (const [nameToken, valueExpected] of Object.entries(valuesExpected)) {
    assert.equal(valuesBuiltIn[nameToken], valueExpected, `${nameTheme} 内置 ${nameToken} 应为 ${valueExpected}`)
    assert.equal(valuesStandalone[nameToken], valueExpected, `${nameTheme}.css ${nameToken} 应为 ${valueExpected}`)
  }

  for (const nameToken of ['text-muted', 'link-color']) {
    const ratio = getContrastRatio(valuesBuiltIn[nameToken], valuesBuiltIn['bg-color'])
    assert.ok(
      ratio >= 4.5,
      `${nameTheme} ${nameToken} 对比度 ${ratio.toFixed(2)} 必须 ≥ 4.5（WCAG AA）`,
    )
  }
}

const valuesDefault = getDefaultTheme()

// 自定义回退合并：局部变量覆盖生效，其余 token 回退到 Light 基线
const valuesPartial = getCustomTheme(`
body {
  --link-color: #0055aa;
}
`)
assert.equal(valuesPartial['link-color'], '#0055aa')
assert.equal(valuesPartial['bg-color'], valuesDefault['bg-color'])
assert.equal(valuesPartial['text-color'], valuesDefault['text-color'])
assert.equal(valuesPartial['border-color'], valuesDefault['border-color'])

// 直接元素选择器不产生任何 token，全部回退到基线
const valuesDirect = getCustomTheme(`
#editor .ProseMirror strong {
  color: #c44b2b;
}
`)
assert.equal(valuesDirect['bg-color'], valuesDefault['bg-color'])
assert.equal(valuesDirect['text-color'], valuesDefault['text-color'])
assert.equal(valuesDirect['border-color'], valuesDefault['border-color'])

console.log(`Theme color contract passed for ${Object.keys(expectedThemes).length} built-in and standalone themes.`)
