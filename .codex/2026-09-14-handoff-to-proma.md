---
title: LyraMD 交接文档（转 Proma 侧继续优化）
date: 2026-09-14
written_by: Cola（子衿）
repo: /Users/cherry_xiao/Developer/PROJECT/LyraMD
head: 4fc3b5905e4030336550560dd91ec90b0c611c80
head_date: 2026-08-25T22:37:41+08:00
package_version: 1.3.8
worktree: clean
test_status: 66 files / 480 tests passed（2026-09-14 18:04 由 Cola 实跑）
purpose: 让在 Proma 侧接手的新 agent 一轮内恢复完整上下文，不重复调研、不踩已知坑
audience: agent
---

# LyraMD 交接文档

> 给接手的 agent：这份文件里的每个数字和状态都是 2026-09-14 在实机上核实过的，不是推测。你不需要重新调研，照下面做即可。要动产品代码前先读同仓库 `AGENTS.md`。

## 0. 一分钟版

产品线是 **LyraMD 1.x**（Electron + Milkdown + electron-vite + Vitest）。本地 `main` 有 **15 个提交没推到 GitHub**，`package.json` 版本还停在 **1.3.8**，安装包最新也只到 1.3.8（2026-07-10 构建）。她电脑上装的是 **1.3.7**，比仓库落后两档。

所以接手后第一优先不是加功能，是三件收口事：**推提交、定版本号、装新版给她用**。

## 1. 当前精确状态

| 项 | 值 |
|---|---|
| 分支 | `main`，工作区 clean |
| HEAD | `4fc3b590` merge: batch3b（2026-08-25 22:37） |
| 仓库总提交 | 165 |
| `package.json` version | **1.3.8**（未随 batch3 更新） |
| 远程 | `origin` = https://github.com/Afeng01/LyraMD.git |
| 未推送 | `origin/main` 停在 `6faa54b6` Release LyraMD 1.3.8，本地领先 **15 个提交**（见第 3 节；含 2026-09-14 新增的两个纯文档提交） |
| 测试 | `npm test` → 66 files / 480 tests **全通过**，1.40 s |
| 主题对比度检查 | `npm run check:themes`（`scripts/check-theme-colors.mjs`，WCAG AA 守卫） |
| 构建产物 | `dist/` 是 08-25 22:38 的构建；`release/` 里最新安装包是 1.3.8（07-10） |
| 已安装 App | `/Applications/LyraMD.app` = **1.3.7** |
| git hooks | 无自定义 hook（这个仓库不挂 Git Gate，与 `~/Documents/十年规划`、`~/Documents/201 - Working/Web3` 不同） |
| node_modules | 1.5 G。**注意**：它被列进 `~/Developer` 清理清单的「建议直接删」堆。如果她勾了，你开工前先 `npm install` |

## 2. 最容易搞错的一件事：版本号

仓库里有 `v1.7.3`、`v1.7.4`、`v1.8.1`、`v1.8.2`、`v1.9.0` 这些 tag，**它们不属于本项目**，属于 `upstream/main`（vmark 那条上游线，`git branch -a --contains v1.9.0` 只有 upstream）。

LyraMD 自己的版本线是 **1.1.x → 1.2.x → 1.3.x**，最高就是 1.3.8。看到 1.9.0 就以为落后了、要"追上版本"，是接手 agent 最常犯的错。不要按上游 tag 排自己的版本号。

## 3. batch3 已落地但没发布的功能（15 个提交）

> **2026-09-14 19:50 复核修正**：本节原写“13 个提交”，实测为 **15**。多出的两个是 2026-09-14 当天新增的纯文档提交，不含产品代码：
> - `87bfbad5` docs(agents): 加当前状态指针（指向本文档）
> - `57fbb5cd` docs: 收入 2026-08-25 对比清单与人话版
>

从 `origin/main..main`，按时间倒序：

| commit | 内容 | 面 |
|---|---|---|
| `4fc3b590` | merge batch3b（保留 3a/3b 两侧的 menu-regression 测试） | — |
| `d07fd5f1` | 内置功能演示 + 帮助菜单入口 | demo |
| `8a79bd6a` | `vscode-extension/`：LyraMD open-in-editor 扩展，带语法检查测试 | 新目录 |
| `9dbc80aa` | 抽出 4 个主题文件 + WCAG AA 对比度守卫 | `themes/`、`scripts/` |
| `f10edc9e` | KaTeX 数学渲染（懒加载 katex + 插入弹窗） | renderer |
| `241a9511` | 非模态更新横幅 + 每版一次的 release notes | update |
| `876883ff` | mermaid 图表渲染（隔离 sandbox iframe） | renderer |
| `2f2faf22` | docx 导出（动态加载 + 锚定保存框） | main |
| `20a7bbd1` | `==highlight==` 标记、可点任务复选框、markdown 速查窗 | editor |
| `245af9dd` | 围栏代码块复制按钮浮层 | renderer |
| `7a230666` | 保存/打开对话框锚定在当前文档旁 | main |
| `4454ed4f` | PDF 导出跟随主题、去掉白边 | main |
| `09c95967` | 关闭 webPreferences.spellcheck | main |

这一批全部有测试覆盖（480 个用例通过），但**没有 CHANGELOG、没有 tag、没有安装包**。她 2026-08-26 定过版本纪律：功能落地就 bump patch，绝不攒批；minor/major 只留给真正的大变化。这批含 6 个新功能，我倾向 **1.4.0**，但版本号归她定，别自己拍。

## 3.5 上一轮对对比清单的收口状态（重要，接手的活主要在这）

batch3 不是乱做的，它是 2026-08-25 那份对对比清单的执行结集：

- 清单本体：`docs/2026-08-25-对比清单-LyraMD-vs-ColaMD.md`（A–D 四表 + commit 指针 + 行号；2026-09-14 起已收入仓库）
- 人话版：`docs/2026-08-25-人话版-编辑器升级清单.md`（同一份的用户语言翻译）

按清单末尾的「动手顺序」逐项核过的现状（2026-09-14 实测）：

| 项 | 状态 | 证据 |
|---|---|---|
| A1、A3、A4、A5、A6、A7、A8、A9、A10、A11、A12、A13 | **已落地** | 上面那 15 个提交逐条对应 |
| **A2 长文分页图片导出** | **未做** | `src/main/` 下只有 `docx-export.ts`，无 `image-export.ts`。清单里写明它上游返工 6 次，要单独立项，失败就退回只保 PDF/docx |
| C1 两份主题真相 | **已解（batch3 有意设计）** | `themes/*.css` 四个独立文件与 `base.css` 内置块由 `scripts/check-theme-colors.mjs` 强制 token 一致 + 目录白名单守住；主题色要改两处，忘改守卫会报错。不是坏味道 |
| C2 巨行 | **已解（2026-09-14）** | 7411 字符单行已拆成 305 行，最长行 281 字符，文件 4663 行；带 token 流等价性校验，480 测试与 check:themes 通过 |
| C3 重复定义 | **原描述为误报，已更正** | grep 计数把逗号分组选择器当成了重复定义；642 条规则里无完全重复规则。真正冗余只有 `#onboarding-directory-preview` 在 `:2685` 被 `:2955` 完全覆盖的这一条，已删 |
| C4 导出 HTML 裸写盘 | **已解（2026-09-14）** | 原描述前提错误：renderer 自 v1.3.1 起就生成带主题样式的完整 HTML。真实缺口是手写样式子集漏了 `mark` 高亮与任务列表且会持续漂移，已改为从已加载样式表按选择器筛选（`src/renderer/export-html.ts`，13 项测试，三主题样张实测） |
| C5 `colamd` 残留 | **已解（2026-09-14）** | 产品 UI 的 fork 叙事已改写，`grep ColaMD src/renderer/index.html src/renderer/main.ts` 零命中；拖拽 MIME 改为 `x-lyramd-workspace`；`CODEX_MCP_SERVER_NAME` 与 sidecar 文件名作为兼容锚保留并注明原因（与用户已有 `[mcp_servers.colamd]` 配置绑定） |
| C6 `index.ts` 静态引入 | **已解（2026-09-14）** | 主进程入口包 **730 kB → 180 kB**，552 kB 的 electron-updater 改为按需加载，只在检查/下载更新时才 require |
| D1–D7 理念分歧 | **维持** | 按清单结论不跟上游（D5 Slides 无需处理，D2/D3/D4/D6/D7 维持本地） |

接手后想找活干，**先把 C 表六条清完再做新功能**：它们直接决定了下次要跟上游时的冲突面积。

## 4. 陈旧分支（建议清理，但先确认）

| 分支 | tip | 相对 main |
|---|---|---|
| `codex/lyramd-2-planning` | 2026-05-06 | 落后 85，另有 9 个独有提交 |
| `codex/visual-polish-live` | 2026-06-16 | 落后 29，1 个独有提交（titlebar/sidebar 视觉打磨） |
| `codex/windows-release-adaptation` | 2026-05-05 | 落后 102，1 个独有提交 |
| `interaction-polish` | 2026-05-31 | 落后 52，无独有提交（可直接删） |

`codex/lyramd-2-planning` 的 9 个独有提交属于当年「LyraMD 2.0」规划线，AGENTS.md 已经明确不重启 2.0，这些提交大概率永久废弃，但删分支前请让她点头。

## 5. 最高优先级的历史包袱：文稿安全

`AGENTS.md` 的技术边界之外，务必先读这两份：

1. `.codex/p0-document-safety-remediation-plan-2026-07-10.md`：2026-07-09 一次真实事故，用户文稿被写成 0 字节，靠 Chronicle 关键帧恢复到 188 行 / 8335 bytes，**仍有一句被统计浮层压住未能定稿，中段可能缺正文**。这份计划是"从事故恢复切到系统性修复"的方案。
2. `.codex/p0-external-update-recovery-2026-07-09.md`：同期外部更新导致的恢复问题。

推论：**任何碰写盘路径、自动保存、外部 Agent 热更新、更新流程的改动，都要先过这两份文档，并且补回归测试。** 这是本项目唯一出过真实数据损失的区域。

## 6. 显式未完成需求（她亲口提过的）

`.codex/open-loops.md` 里只有一条还没做：

> Support split views later, both vertical and horizontal, while keeping the first-screen editor simple.

分屏（横向 + 纵向），前提是首屏编辑器保持简单。其余条目都标了 Done。

## 7. 边界（来自 `AGENTS.md`，不可越）

1. 不换技术栈：Electron、electron-vite、TypeScript、Milkdown / ProseMirror、Vitest 继续用。
2. 不重启 LyraMD 2.0，不做 VMark-derived 重构，不升级成 Tauri / React / 完整 IDE / 知识库。
3. VMark 只作交互参考（侧边栏收纳、低打扰 AI 入口、宽屏右侧面板 / 窄屏底部抽屉、文件树轻交互）。
4. 命名：产品和发布名一律 **LyraMD**；`ColaMD` 只允许出现在上游署名、历史会话标题、遗留路径、MCP server id 这类兼容位。
5. 局部依赖对齐、测试补强、Electron/Milkdown 内部重构可以做，前提是当前产品可运行、可构建、可回滚。

## 8. 验收命令与发布门

```bash
npm install            # 若 node_modules 被清
npm test               # vitest run，基线 66 files / 480 tests 全绿
npm run check:themes   # 主题对比度守卫
npm run build          # electron-vite build
npm run dist:mac       # 出 mac 安装包
```

发布前走 `docs/release-checklist.md`，它的 Required Gates 有三条：命名确认、合并 worktree 后必须重新构建并打开过再发布、自动化验证（含 `npm ls @milkdown/core @milkdown/kit --depth=2`）。第 2 条是踩过坑写的，别跳。

## 9. 我建议接手方按这个顺序做

1. `git push origin main`（13 个提交先脱离本地孤本状态）。这一步涉及外部发布，需要她明确点头。
2. 定版本号：1.4.0（我的建议）或 1.3.9，补 tag 与 release notes，走一遍 `docs/release-checklist.md`。
3. 出一版 mac 安装包并替换 `/Applications/LyraMD.app`（她现在用的还是 1.3.7，等于 batch2、batch3 的功能她一个都没享受到）。
4. 清 4 条陈旧分支（先让她点头）。
5. 清 C 表六条（见 3.5），它比新功能优先。
6. 然后才轮到新功能；候选是 A2（长文分页图片导出，单独立项，失败就退回只保 PDF/docx）和第 6 节的分屏，以及 P0 文稿安全计划里未收口的项。

## 10. 与 `~/Developer` 清理清单的关系

`/Users/cherry_xiao/cola/outputs/inbox/Developer清理决策清单-2026-09-14.md` 里，本仓库只有 `node_modules`（1.5 G）被列入建议删除项，仓库本体保留。若她勾了 A1，本仓库需要重装依赖才能跑测试，源码与 git 历史不受影响。

## 11. 2026-09-15 增量（Cola 侧接手）

Proma 因额度消耗暂停后由 Cola 接手，当日完成并全部已 commit（本地领先 origin 的提交数请以 `git status` 实时为准）：

- **C 表六条技术债全部收口并提交**：Proma 的工作区改动（当时未提交）按功能块分成 5 个 commit（`e48f6095` C2+C3、`5a88bca9` C6、`df06f246` C5、`bf86af71` C4、`4aa7918d` docs）。测试 496 全绿后提交。
- **`.codex/` 纳入版本控制**（同批提交）：她当日曾短暂回退、最终仍拍板「放出来」。检查过内容，无敏感信息；另有 zip 存档在仓库外 `~/Developer/PROJECT/lyramd-codex-docs-archive-2026-09-15.zip`。origin 若将来开源需先清理内部叙事。
- **文稿安全项①决策面落地**（`5bf9a908`）：被拦面板新增「接受外部版本」「查看 diff」，主进程被拦时额外携带 fullSummary（LCS，200 行预览），新 IPC `accept-external-change`。
- **文稿安全项②journal 落地**（`2337631d`）：`src/main/document-journal.ts`，JSONL 追加写 `~/.lyramd/document-journal.jsonl`，12 类事件，写失败不阻断保存链。
- **文稿安全项③安装版 destructive drill 延后至下次发版**（她拍板）：drill 依赖包含本轮改动的新安装包。
- 测试基线从 66 files / 480 tests 推进到 **68 files / 503 tests**，`npm run build` 通过。详见 P0 计划 §0.2。
