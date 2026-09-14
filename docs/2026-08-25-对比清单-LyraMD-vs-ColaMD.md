# LyraMD(main 1.3.8) × ColaMD(upstream/main 1.9.0)

`up:`=upstream/main，`lo:`=main。merge-base `8458049d`（ColaMD 1.3.1）；本地137 commit（04-26→07-10）、上游77 commit（05-07→08-19）；全程只读，未checkout/merge。
成本前提：上游src仅19文件（`main/index.ts`1437行、`renderer/main.ts`577行、0测试）；本地`src/main`52文件、两大文件3130/4227行、57个vitest ⇒ 上游碰这三处的commit不能cherry-pick，只能按指针重写。

## 上游版本演进时间线（分叉点起，77 commit全数入表；有tag的仅v1.4.0/v1.5.0/v1.7.3/v1.7.4/v1.8.1/v1.8.2/v1.9.0，余为发布commit）

|版本|加了什么 → 对本地|
|---|---|
|v1.4.0|Slides「MD as Database」`a7d0389e` | 未吸收D5|
|v1.5.0|Export Slides+教程模板`1cddc31b 939ea863` | 未吸收D5|
|v1.6.0|原子写实同、spellcheck off、类型修复`2fe95233` | 写:本地更强；spellcheckA11|
|v1.6.1|可编辑待办、`==高亮==`、语法速查`be993818` | 全缺A10|
|v1.6.2|端到端删除Export HTML`970229db` | 本地停在被删前语义C4|
|v1.7.0|⌘F搜索+KaTeX（PR#14`df188208`）`32f7528b` | 搜索另有一套B9；公式A9|
|v1.7.1|checkbox可点、面板开关`349c55ed` | A10|
|v1.7.2|可玩演示页`c3cb6467` | A13|
|v1.7.3|演示页改累积changelog`8999daca` | A13/A6|
|v1.7.4|源码模式、文件面板完善、HTML导出带快照重做、Win图片路径、VS Code集成MVP`e13aac11` | D2；C4；A12|
|v1.8.0|图片路径可移植保存（渲染`file://`/落盘相对）、HTML图片同步、代码块复制`89598b06` | 路径已等价B12；复制A5|
|v1.8.1|移除Mermaid(CPU storm)、无权限启动(不扫`~/Documents`)、双语语法文档`89863340` | 文稿目录已对齐（`lo:main/index.ts:1506`仅草稿用）|
|v1.8.2|12主题独立CSS+premium+set-as-default`9b1250d3 0eb7858a` | A7/D1|
|1.8.2→1.9.0|防丢`72bea828 c4ff133e`、横幅`812c993c 2766be68`、标题栏瘦身`d35cbe1b`、语义token`f017031b 190c3891`、启动性能`47e94ffb`、feature-requests清单`4c986a4e 4ebdd281` | 防丢/瘦身本地更强；A6；A7|
|v1.9.0|docx/图片分页导出、主题化PDF、侧栏大纲、导出块懒加载`91d88ff4`、首启changelog、对话框锚定、Mermaid沙箱重做`88de9a38`、多窗口仅列request`bf57f8b3` | A1-A4/A6/A8；D3；B5|

77 commit已全数入表；余量为README/站点文案与发版号提交，签名CI恢复`0b2c3652`见D4。

## 0. A–D 总览

|☐|项|
|---|---|
|☐|A1 docx导出|
|☐|A2 图片分页导出|
|☐|A3 PDF跟主题去白边|
|☐|A4 对话框锚当前目录|
|☐|A5 代码块复制|
|☐|A6 更新横幅+首启changelog|
|☐|A7 主题文件化+对比度脚本|
|☐|A8 Mermaid沙箱|
|☐|A9 KaTeX公式|
|☐|A10 高亮/待办/速查|
|☐|A11 关拼写红线|
|☐|A12 VSCode打开扩展|
|☐|A13 演示与changelog文档|
|☐|B1 MCP sidecar+Codex引导|
|☐|B2 Agent改动摘要/回滚|
|☐|B3 破坏性覆盖拦截|
|☐|B4 修订快照+崩溃恢复|
|☐|B5 多窗口并行|
|☐|B6 workdir树+pinned+废纸篓|
|☐|B7 草稿系统|
|☐|B8 AI helper+genie palette|
|☐|B9 自有搜索栈|
|☐|B10 CJK+frontmatter|
|☐|B11 快捷键持久化|
|☐|B12 托管图片资产|
|☐|B13 发版线+设置窗|
|☐|B14 57个vitest回归|
|☐|C1 elegant.css双份真相|
|☐|C2 base.css巨型单行|
|☐|C3 重复死CSS规则|
|☐|C4 export-html无样式|
|☐|C5 colamd命名残留|
|☐|C6 main全静态import|
|☐|D1 主题路线|
|☐|D2 源码模式|
|☐|D3 大纲位置|
|☐|D4 签名/公证|
|☐|D5 Slides|
|☐|D6 单文档无tab|
|☐|D7 agent语义|

## A. 上游有、本地没有、值得吸收（13；候选池=全部77 commit）

- **A1 中** `91d88ff4`：`up:main/docx-export.ts`181行自包含+IPC`up:main/index.ts:655-681`+`docx@^9.7.1`；`await import()`挪出启动路径（1.73MB→604KB）。本地只导PDF/HTML，长文交付卡在这。
- **A2 高** `65fba5b4`+`up:main/image-export.ts`(101行)、`:683-733`；6个修复反复改`af3f2a85 56e90d75 a2c163f7 cb615773 6425413c 1dea467d`（渲染源、PNG流、内容测量、CDP截图）。难度全在这条链，必须连着搬；发长文才用得上。
- **A3 低** `1dea467d` export-pdf段：读`getComputedStyle(body).backgroundColor`+`@page{margin:0}`+`padding:20mm`+`try/finally`清insertCSS。`lo:main/index.ts:2741-2765`是上游改前形态，且`removeInsertedCSS`不在finally（失败会把打印CSS留在页面）。约15行。
- **A4 低** `be065ea3 11d0cf93`+`suggestSavePath`（`up:main/index.ts:222-227`，5行）。本地只有`suggestFileName`（`lo:main/index.ts:1518`），同文件8处save/open对话框都没锚目录，多窗口+workdir下每次重找。
- **A5 低中** v1.8.0社区项+`2f60de6c`：`up:renderer/editor/editor.ts:108-200`（`pre`外单个overlay按钮，避开contenteditable污染）。本地`grep copy`0命中——她天天捞代码给agent。
- **A6 中** `812c993c`横幅（4文件+267行）+`2766be68`检查中可见+`abca1f8d`首启一次性changelog（+21）。本地`lo:main/updater.ts:18-116`全走模态`showMessageBox`打断写作；已有release notes面板⇒"跳一次"白送。
- **A7 低中** `9b1250d3`（12份CSS×19-45行）+`0eb7858a`（premium.css+set-as-default）+`f017031b 190c3891`（语义token+`scripts/check-theme-colors.mjs`+36防不可读）。本地`~/.lyramd/themes`已在（`lo:main/index.ts:101-103`），缺主题与防呆。
- **A8 中** `88de9a38`：`mermaid-view.ts`(158)+`mermaid-bridge.ts`(117)+`sandbox/mermaid-sandbox.ts`(43)+iframe懒创建、400ms debounce、15s超时、忽略nodeview内部mutation；约330行，成本在接进Milkdown`$view`。按需（写架构笔记才有用）。
- **A9 中** v1.7.0 `df188208 32f7528b`：`up:renderer/editor/math-modal.ts`(169)+`⌘⇧E`插入、点击回编辑；本地0依赖。与A8同属节点扩展，同批拍板。
- **A10 低中** v1.6.1 `be993818`：`up:renderer/editor/highlight.ts`(87)+`templates/cheatsheet.md`(81，v1.8.1起双语)；可点checkbox要带v1.7.1 `349c55ed`。她的plans满屏`- [ ]`⇒待办能点是真需求。
- **A11 低** v1.6.0 `2fe95233`：`up:main/index.ts:155-156` `spellcheck:false`（注释直指issue #7红波浪线）；本地`lo:main/window-platform.ts:15-19`无此项⇒2行，中文写作受益。
- **A12 低中** v1.7.4 VS Code集成MVP：`up:vscode-extension/`（`extension.js`123行等4文件）：未保存先落盘让watcher看到。改名+路径解析即可，贴她的Codex/Cursor面。
- **A13 低** v1.7.2 `c3cb6467`+v1.7.3 `8999daca`：`up:resources/demo/{changelog,tasks,agent-sim}.md`可玩changelog+演示副本；她只有release notes面板，缺可玩样例。

## B. 本地独有（14，防未来rebase覆盖丢失）

- **B1** `mcp/colamd-mcp-server.mjs`（extraResources唯一条目）+`lo:main/codex-integration.ts:10,59-61`+`mcp-bridge.ts`；上游无`mcp/`。
- **B2** `agent-change-summary.ts`（LCS差分`:38-63,:201`）+`renderer/agent-change-session.ts`、`agent-change-autodismiss.ts`（3s收起、首轮展开）+`9e74a01a` rollback、`d5c021a6`。
- **B3** `external-change-risk.ts:30`（删除比例阈值）+`83a0c0c1 38c8aa77 246077c9`；状态落`external-change-recovery.json`；含`external-change-guard-regression.test.ts`。
- **B4** `revision-store.ts`（`:131 :259`快照与保留裁剪）+`d92aba03`崩溃恢复网+`eaefce29`恢复面板。
- **B5** `lo:main/index.ts:1372` createWindow工厂、`:1439 :3073-3086`新窗打开、`d666f98d`跨窗主题同步；`up:main/index.ts:143`仍单窗口，多窗口只是request。
- **B6** `workdir.ts`/`sidebar-state.ts`/`workbench-state.ts`（workspace历史/pinned/迁移）+`66e9c4b1 33f36c31`（树）、`7c462758`（重命名/删除确认）、`8776ee41`（废纸篓）。
- **B7** `drafts.ts`/`draft-filenames.ts`（标题→文件名、冲突后缀）；手动保存=提升为正式文件（`plans/2026-05-04-…workbench-stabilization`）。
- **B8** `ai-provider.ts`（OpenAI兼容+自检`85936547`）+`86fb0f4d bab00f4e`（结果回填）、`c0b1e13b`（presets）；上游无AI面板。
- **B9** `prosemirror-search`+`editor/search.ts`+`search-memory.ts`（每文档记忆、外部刷新后match回落）+`581ab3c8`锁定；上游v1.7.0是PR#14另套实现，勿被覆盖。
- **B10** `editor/cjk-format.ts`（`0207f0aa`）+`editor/frontmatter-node.ts`（`27a42c37`）+`remark-frontmatter`/`remark-breaks`；上游皆无。
- **B11** `b43dde60`持久化、`cc36ac4e`冲突检测、`zoom-shortcuts.ts`+`408f6ed8`原生zoom、`f9012d25`录制式UI。
- **B12** `image-assets.ts`（`:26 :31 :35 :58`）+`image-title-metadata.ts`（宽高往返进title）+`markdown-media.ts`（渲染绝对/落盘相对=上游v1.8.0）+`c67e4dd8`；上游1.9.0前自认不可靠撤回⇒本地净领先。
- **B13** `37627fab`+`scripts/windows-release-smoke.ps1`+`windows-launch.ts`；`87f610e6`+`update-release.ts`未签名回退；`25f8a055`设置窗、`eed7ba92` release notes、`b4f3b5ec` GitHub反馈。
- **B14** 57个`src/**/*.test.ts`+`vitest.config.ts`（含`menu-regression`/`updater-regression`/`external-change-guard-regression`）=A类验收面。

## C. 疑似冗余/坏味道（6）

- **C1** `themes/elegant.css`(426行)与`lo:renderer/themes/base.css:3940`的`body.theme-elegant`两份真相；`git grep "themes/elegant" src`0引用、builder不打包、运行时只读`~/.lyramd/themes`⇒不加载不分发；随A7变真目录或删。
- **C2** `base.css:3929`单行7291字符（文件4046行）：整段样式压成一行，diff不可读且放大与上游同文件的冲突面积。
- **C3** 重复定义：`.ai-helper-preview`1413/1429/1441（前两份被覆盖）、`.outline-item.level-6`1835/1840/1845；`body.platform-win32 #outline-toggle`、`.window-control`、`.settings-integration-error`各两处。
- **C4** `lo:main/index.ts:2768`把`renderer/main.ts:3100`传来的裸`htmlContent`原样写盘（无styles/bodyClass）⇒导出件无主题样式。上游v1.6.2以"和编辑器重复"删掉（`970229db`），v1.7.4带快照重做（`up:main/index.ts:776-790`）；本地停在被删前语义。
- **C5** `colamd`残留：`mcp/colamd-mcp-server.mjs`、`codex-integration.ts:10`、`agent-cli.ts:126`、`renderer/main.ts:3708,3715,3736`。前两条是与既有Codex配置的兼容锚（改名有代价，建议保留+注明）；后两条可改。`renderer/index.html:814,817,827`还把fork叙事写进产品UI。
- **C6** `lo:main/index.ts:1-100`静态引入52个main模块（含只在菜单用的updater），上游1.9.0已按需import（`d269e9f3 47e94ffb`）。与A1同批最省。

未发现重复的顶层功能对（搜索、大纲、更新检测、workdir各一套）；`src/renderer`无孤儿模块（`env.d.ts`是类型声明）。

## D. 理念分歧（7）

- **D1** 上游12 CSS文件+主题菜单 vs 本地内联主题+背景外观控件（`64a5565e`）+用户目录导入。**可重议**：v1.8.2后上游已是"文件即主题、与编辑器解耦"，与她的取向不冲突；先清C1。
- **D2** 上游v1.7.4起`toggle-source-mode`（`up:main/index.ts:1149-1151`、`up:renderer/main.ts:7,152-153`（大纲/查找都带分支）；本地0命中。**建议维持**：单编辑面Milkdown+frontmatter节点化，源码视图拆掉"文档即节点"前提；搬A7/A10时要删掉这些分支。
- **D3** 上游并进左栏Files/Outline单入口（`70cba368 5e3a7d3b`）vs 本地刻意"右panel、左栏只放当前工作"（`lo:renderer/main.ts:728,776`+`outline-shortcut.test.ts`）。**维持**。
- **D4** 上游`0b2c3652`恢复签名+公证；分叉前v1.3.2~v1.3.4正是签名反复（`52335c7d 800e4592`），merge-base恰是那次的`revert`；本地`87f610e6`选未签名+手动回退。**维持**（门槛是账号不是代码）；`up:resources/entitlements.mac.plist`留作参考。
- **D5** Slides：上游v1.4.0-v1.5.0做过、v1.8起从`src`完全消失；本地从未吸收。**无需处理**，列出防将来误判漏功能。
- **D6** 上游把多窗口停在Candidates且明写"不引入tabs、不引入共享工作区"（`bf57f8b3`）；本地已多窗口+workspace/pinned。**维持本地**。风险：上游凡假设"一窗一文件"的实现（`c4ff133e suggestSavePath 2766be68`）搬来要逐窗验证。
- **D7** 上游定位"和Claude Code、Cursor共享同一份文件实时显示" vs 本地"摘要、可回滚、破坏性写入先拦下并留恢复入口"（B2/B3）。**维持本地更强约束**；触碰`file-sync.ts`/`content-sync.ts`的上游commit必须先过`external-change-risk.ts`。

## 动手顺序（8/28冻结期内一律不动；以下全部"冲刺后"）

1. C1+C2+C3：先把与上游冲突面积最大的文件变小。
2. A11（2行）→A4→A3→C4（补样式或删）。
3. A1+C6：docx+动态import+菜单/preload，补`menu-regression.test.ts`。
4. A6+A7+A13：横幅与首启changelog、主题目录化+对比度脚本、演示文档。
5. A5→A10→A12：编辑器小增量与外部入口，各补vitest。
6. A2单独立项：6轮返工是真复杂度；失败就退回只保PDF/docx并删C4。
7. A8+A9一起拍板；不做就写进文档注明刻意不做。
8. 每步收尾`npm test`；不cherry-pick，按本表指针重写。
