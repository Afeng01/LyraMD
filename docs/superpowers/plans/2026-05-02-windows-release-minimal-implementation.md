# Windows Release Minimal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不扩展产品范围的前提下，让 LyraMD / ColaMD 具备可验证、可重复的 Windows 安装包发版能力，并覆盖核心使用链路。

**Architecture:** 保持现有 Electron 主进程与 renderer 结构不变，只补最小的平台兼容层、Windows 打包资源和发版文档。实现重点放在三处：Windows 打包元数据、Windows 启动/文件打开行为、Windows 实机验证与发布说明。

**Tech Stack:** TypeScript, Electron main process, electron-builder, NSIS, GitHub Actions, Vitest

---

## Scope And Release Bar

本计划的“最小发版”定义如下：

- 产出可安装的 Windows `nsis` 安装包
- 安装后可正常启动、打开 `.md` 文件、保存、另存为、导出
- 外部 Agent 修改当前文件时，Windows 上的热更新行为可用
- Release 页面和 README 对 Windows 安装方式有明确说明

本计划**不**包含以下扩展项：

- 自动更新
- Windows ARM64 产物
- Microsoft Store / AppX / MSIX
- Jump List、最近文档系统集成
- 正式商业级代码签名流程

签名策略：

- `beta / 内测分发`：允许 unsigned build，但文档里必须明确说明 SmartScreen 风险
- `公开正式发版`：建议追加 Windows code signing；本计划把它标成“后续增强项”，不作为当前最小改造阻塞项

---

## Chunk 1: Packaging And Release Metadata

### Task 1: 补齐 Windows 打包资源与 builder 配置

**Files:**
- Modify: `electron-builder.yml`
- Modify: `package.json`
- Create: `resources/icon.ico`

- [ ] **Step 1: 审核现有 Windows builder 配置**

检查以下现状：
- `electron-builder.yml` 已声明 `win.target = nsis`
- `package.json` 已声明 `dist:win`
- `resources/` 目录当前没有 `.ico`

Run:
- `sed -n '1,220p' electron-builder.yml`
- `sed -n '1,220p' package.json`
- `ls -la resources`

Expected:
- 看到现有 `nsis` target 和 `icon.png`
- 确认还缺 `icon.ico`

- [ ] **Step 2: 为 Windows 补最小必要配置**

更新 `electron-builder.yml`，只加最小必要字段：
- Windows 使用 `resources/icon.ico`
- 明确 `artifactName`
- 明确安装器名称与卸载显示名称
- 如需控制架构，先只收敛到 `x64`

建议保留最小配置，不引入自动更新或发布 provider。

- [ ] **Step 3: 生成并提交 Windows `.ico`**

从现有主图标资源生成 `resources/icon.ico`，要求：
- 包含常见尺寸（至少 16/32/48/256）
- 与 mac / linux 图标视觉保持一致
- 不新增新的视觉设计方向

Run:
- 使用本地图像工具或脚本从 `resources/icon.png` / `resources/icon-new.png` 生成 `resources/icon.ico`

Expected:
- `resources/icon.ico` 存在
- 安装器和任务栏图标不再回退为低质量默认图标

- [ ] **Step 4: 本地构建 Windows 安装包**

Run:
- `npm run build`
- `npx electron-builder --win nsis --x64 --publish never`

Expected:
- PASS
- `release/` 下出现 Windows `.exe`

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml package.json resources/icon.ico
git commit -m "build: prepare minimal windows release assets"
```

### Task 2: 明确 Windows 安装与 unsigned 分发说明

**Files:**
- Modify: `README.md`
- Modify: `README_CN.md`

- [ ] **Step 1: 添加 Windows 安装章节**

文档中新增：
- Windows 下载什么产物
- 如何安装
- 第一次启动可能遇到的 SmartScreen 提示
- unsigned beta 的风险说明

- [ ] **Step 2: 保持平台说明并列而非覆盖**

要求：
- 不删除现有 macOS 安装说明
- Windows 章节与 macOS 章节并列存在
- 英文 README 与中文 README 信息对齐

- [ ] **Step 3: 文档自检**

Run:
- `sed -n '1,220p' README.md`
- `sed -n '1,220p' README_CN.md`

Expected:
- 两份 README 都明确包含 Windows 安装入口和风险提示

- [ ] **Step 4: Commit**

```bash
git add README.md README_CN.md
git commit -m "docs: document windows installation flow"
```

---

## Chunk 2: Windows Runtime Compatibility

### Task 3: 给主窗口配置加平台分支，移除 mac-only 假设

**Files:**
- Modify: `src/main/index.ts`
- Create: `src/main/window-platform.test.ts`
- Test: `src/main/window-platform.test.ts`

- [ ] **Step 1: 为窗口配置提取最小测试缝隙**

当前 `createWindow()` 里直接写死了：
- `titleBarStyle: 'hiddenInset'`
- `trafficLightPosition`

先抽出一个最小 helper，用于返回平台相关窗口选项。不要顺手做大重构。

- [ ] **Step 2: 写失败测试覆盖平台分支**

测试至少覆盖：
- `darwin` 仍返回现有无边框标题栏配置
- `win32` 不再返回 `hiddenInset` / `trafficLightPosition`
- Windows 配置不会破坏现有 `preload` / `contextIsolation` 等安全项

Run:
- `npm test -- src/main/window-platform.test.ts`

Expected:
- FAIL，只失败在新增平台断言

- [ ] **Step 3: 实现最小平台分支**

在 `src/main/index.ts` 中：
- macOS 保持当前标题栏体验
- Windows 改为可正常显示和拖动的窗口配置
- 不在这一步引入新的自定义标题栏系统

- [ ] **Step 4: 回归构建**

Run:
- `npm test -- src/main/window-platform.test.ts`
- `npm run build`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/window-platform.test.ts
git commit -m "fix: gate mac-specific window chrome on windows"
```

### Task 4: 补 Windows 的单实例与文件关联打开链路

**Files:**
- Modify: `src/main/index.ts`
- Create: `src/main/windows-launch.test.ts`
- Test: `src/main/windows-launch.test.ts`

- [ ] **Step 1: 写失败测试覆盖 Windows 启动语义**

测试至少覆盖：
- 从 argv 中提取 Markdown 文件路径
- 第二次启动时通过 `second-instance` 把文件交给现有窗口
- 已打开文件时聚焦已有窗口，而不是静默多开

Run:
- `npm test -- src/main/windows-launch.test.ts`

Expected:
- FAIL，只失败在新增 Windows 启动断言

- [ ] **Step 2: 实现最小单实例接管**

在主进程中补以下能力：
- `requestSingleInstanceLock()`
- `second-instance` 事件处理
- 抽出 argv 文件路径解析逻辑，兼容 dev / packaged 差异

注意：
- 保留现有 macOS `open-file` 逻辑
- 不改变“空白窗口可复用、已打开文件复用已有窗口”的现有产品语义

- [ ] **Step 3: 做定向验证**

Run:
- `npm test -- src/main/windows-launch.test.ts`
- `npm run build`

Expected:
- PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/main/windows-launch.test.ts
git commit -m "feat: support windows single-instance file launch"
```

### Task 5: 在 Windows 语义下加固文件热更新

**Files:**
- Modify: `src/main/file-sync.ts`
- Modify: `src/main/file-sync.test.ts`
- Test: `src/main/file-sync.test.ts`

- [ ] **Step 1: 补足 Windows 风险用例**

新增测试覆盖：
- `rename` 事件后文件被原子替换
- `changedName` 缺失时仍可处理目标文件刷新
- 连续快速写入下不会丢失最终内容

Run:
- `npm test -- src/main/file-sync.test.ts`

Expected:
- FAIL，只失败在新增 watcher 边界用例

- [ ] **Step 2: 最小修正 watcher 行为**

只修正 `watchTargetFile()` 和相关判定，不重写整套同步架构。目标是：
- Windows 常见保存方式可触发 reload
- 非目标文件变化仍被过滤
- 保持当前 agent activity 判定的整体结构

- [ ] **Step 3: 回归验证**

Run:
- `npm test -- src/main/file-sync.test.ts`
- `npm run build`

Expected:
- PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/file-sync.ts src/main/file-sync.test.ts
git commit -m "fix: harden windows file watch behavior"
```

---

## Chunk 3: Release Verification And Publishing Gate

### Task 6: 让 CI 明确验证 Windows 产物存在

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: 审核当前 release workflow**

确认：
- `windows-latest` 已参与 matrix
- 当前只做构建与 artifact 上传
- 没有显式检查 Windows 产物名称是否存在

Run:
- `sed -n '1,220p' .github/workflows/release.yml`

Expected:
- 看到 Windows job，但没有专门的 Windows 产物 smoke gate

- [ ] **Step 2: 增加最小 smoke gate**

只补最小检查：
- Windows build 后断言 `release/*.exe` 至少存在一个
- 如 builder 输出文件名变化，优先调整 glob，不引入额外发布复杂度

- [ ] **Step 3: 验证 workflow 语法**

Run:
- 通过本地 YAML 检查或提交后观察 GitHub Actions 语法结果

Expected:
- workflow 可正常执行

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: assert windows release artifact exists"
```

### Task 7: 执行 Windows 手工验收清单

**Files:**
- Modify: `docs/superpowers/plans/2026-05-02-windows-release-minimal-implementation.md`

- [ ] **Step 1: 在真实 Windows 环境安装产物**

验收环境：
- Windows 11 优先
- 使用 `release/*.exe` 安装器

- [ ] **Step 2: 走完整条核心链路**

手工验证以下行为：
- 安装器正常启动与安装
- 桌面/开始菜单快捷方式可打开 App
- 直接启动 App 可进入空白文档
- `Open...` 能打开 `.md`
- 双击 `.md` 或命令行传入文件路径时，App 能打开目标文件
- 第二次打开文件时，现有窗口/实例行为符合预期
- 编辑、保存、另存为、导出 PDF、导出 HTML 均可用
- 外部脚本修改当前 `.md` 文件时，编辑器能自动刷新

- [ ] **Step 3: 记录人工验证证据**

至少记录：
- Windows 版本
- 安装包文件名
- 每个核心链路是否通过
- 失败项与复现步骤

- [ ] **Step 4: 更新本计划中的验证结果**

若本计划被直接执行，在文档末尾追加：
- 实际运行命令
- Windows 手工 QA 结果
- 剩余风险

---

## Final Release Gate

只有在以下条件全部满足后，才允许把 Windows 产物作为正式 Release 附件对外宣传：

- `npm test` PASS
- `npm run build` PASS
- Windows `nsis` 安装包成功产出
- README / README_CN 已包含 Windows 安装说明
- Windows 手工 QA 覆盖核心链路并通过

如需把本次发布定义为“正式公开可下载版本”，建议额外补做：

- Windows code signing
- 一轮干净虚拟机安装验证
- 一次从 GitHub Release 页面重新下载并安装的外部路径验证

---

## Proof Pack Template

执行完成后，交付中至少包含：

- **What:** 补齐了哪些 Windows 发版最小改造项
- **Why:** 为什么这些是当前最小阻塞项
- **Verification:** 自动测试、构建、Windows 手工 QA 的证据
- **Risk:** 剩余风险级别（低 / 中 / 高）
- **Human Review Focus:** 人类优先复看的 1-2 个点

Plan execution notes are appended below.

---

## Execution Result - 2026-05-05

### What

已补齐 Windows 最小发版适配：

- Windows NSIS 打包配置收敛到 x64，并使用 `resources/icon.ico`
- 从现有 `resources/icon.png` 生成 Windows `.ico`
- README / README_CN 增加 Windows 安装说明和 unsigned SmartScreen 风险提示
- 主窗口配置增加平台分支，macOS 保留 hidden inset，Windows 使用 native window chrome
- Windows 启动链路增加单实例锁、`second-instance` 接管和 Markdown argv 解析
- 文件 watcher 放宽 Windows 常见 `changedName` 缺失场景，同时继续过滤非目标文件
- release workflow 增加 Windows `.exe` 产物 smoke gate
- `scripts/afterPack.js` 改为只在 macOS target + macOS host 下清理 `.app` 扩展属性，避免 Windows 打包误找 `.app`

### Verification

已运行并通过：

- `npm test -- src/main/window-platform.test.ts src/main/windows-launch.test.ts src/main/file-sync.test.ts src/main/title-sync.test.ts`
  - PASS: 4 test files, 34 tests
- `npm test`
  - PASS: 25 test files, 181 tests
- `npm run build`
  - PASS: main / preload / renderer 均完成 production build
- `npx electron-builder --win nsis --x64 --publish never`
  - PASS: 生成 `release/LyraMD-Setup-1.1.3-x64.exe`
- `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/release.yml')"`
  - PASS: release workflow YAML 可解析
- `test -f release/LyraMD-Setup-1.1.3-x64.exe`
  - PASS: Windows installer exists
- `file release/LyraMD-Setup-1.1.3-x64.exe resources/icon.ico`
  - PASS: installer 是 Windows NSIS self-extracting archive；`.ico` 包含 4 个 Windows icon 尺寸
- `npx tsc --noEmit --strict --esModuleInterop --skipLibCheck --moduleResolution node --module CommonJS --target ES2022 src/main/window-platform.ts src/main/windows-launch.ts src/main/file-sync.ts`
  - PASS: 本次新增/修改的 main helper 类型检查通过
- `git diff --check`
  - PASS: 当前 diff 无 whitespace error

补充说明：

- `npx tsc -b --noEmit` 当前不是可用基线；失败包含既有 project-reference 配置问题，以及本次 Windows 适配以外的旧 renderer/main 类型错误。
- 尝试用 electron-builder 缓存的 Wine 对 NSIS 安装器做 silent install smoke，但 Wine 在本机卡在 FreeType / Mono 初始化路径，已中止并清理临时 prefix；该结果不计入 Windows QA 通过证据。

### Windows Manual QA

未完成。当前环境是 macOS，不能替代真实 Windows 11 安装验收。

正式对外宣传 Windows Release 前仍需在真实 Windows 环境验证：

- 安装器正常启动与安装
- 桌面/开始菜单快捷方式可打开 App
- 直接启动 App 可进入空白文档
- `Open...` 能打开 `.md`
- 双击 `.md` 或命令行传入文件路径时，App 能打开目标文件
- 第二次打开文件时，现有窗口/实例行为符合预期
- 编辑、保存、另存为、导出 PDF、导出 HTML 均可用
- 外部脚本修改当前 `.md` 文件时，编辑器能自动刷新

可使用辅助脚本生成验收报告：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-release-smoke.ps1 `
  -InstallerPath .\release\LyraMD-Setup-1.1.3-x64.exe `
  -ReportPath .\windows-release-smoke-report.md
```

该脚本会在 Windows 上静默安装到临时目录，准备两个测试 Markdown 文件，依次引导启动、argv 打开、shell `.md` 打开、second-instance、外部写入热更新、保存/另存为和导出，并生成 `windows-release-smoke-report.md`。

### Risk

风险级别：中。

自动测试、构建和本机交叉打包已覆盖最小 Windows 发版适配的代码路径和产物生成；剩余风险集中在真实 Windows GUI 行为、文件关联注册、SmartScreen/unsigned 安装体验，以及真实安装后的热更新行为。

### Human Review Focus

- 在 Windows 11 上重点复测 `.md` 文件关联、second-instance 文件打开、已有窗口复用。
- 复看 unsigned Windows 分发文案是否符合当前 beta 分发预期；公开正式发版前建议补 code signing。
