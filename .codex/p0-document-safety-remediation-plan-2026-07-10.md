# LyraMD 文稿安全 P0 整改方案（2026-07-10）

此文件帮助人类与 agent 从“事故恢复”切换到“系统性修复”。目标不是解释一次 bug，而是建立一套让文稿资产在外部写入、旧进程、误操作、崩溃、重启、发布漂移等场景下仍可恢复的安全体系。

## 0. 复核状态（2026-09-14，Proma 侧实测）

本方案写于 2026-07-10。第 3 章记录的止血修复之后，代码又经过一轮加固，因此**第 4 章有部分条目已经落地**，直接按原文立项会重复劳动。接手前先读这一节。

实测证据均来自 2026-09-14 当前 `main`（HEAD `57fbb5cd`，`npm test` 66 files / 480 tests 全绿）。

| 条目 | 2026-09-14 实测 | 证据 |
|---|---|---|
| P0-A 高风险外部内容不直接落正文 | **已落地**（原文 §4.1 的缺口描述已过时） | `src/main/index.ts:1683` `blockedDestructiveApply`：命中阈值时正文保持原样，只落 recovery 快照并通知渲染层 |
| P0-A 四选一决策面 | **部分**：已有「撤回这次更新」「恢复覆盖前正文」；缺「接受外部版本」「查看 diff」 | `src/renderer/index.html:255,282` |
| P0-B append-only 事件日志 | **未做** | 全仓 `appendFile` / `journal` 零命中 |
| P0-C last-known-good 镜像 | **未做** | 全仓 `last-known-good` 零命中 |
| P0-D 文稿安全面板 | **已落地**；destructive 时强制展开且不自动收起 | `src/renderer/index.html:118` `#safety-toggle`；`src/renderer/main.ts:1119-1124` 对 destructive 走 `agentChangeAutoDismiss.clear()` 并打开面板 |
| P0-E 运行态实例可见 | **部分**：已有旧实例提示；设置页未展示启动时间 / build hash | `src/main/runtime-update-guard.ts` |
| P0-F 多窗口 / 多来源写入仲裁 | **未做** | 全仓 `lease` / `arbitrat` 零命中 |
| P0-G 恢复默认进新草稿 | **已落地**；恢复不改写原文件 | 恢复动作只写新草稿 |
| P0-H 事故包一键导出 | **未做**；现有“诊断信息”只含主题与 User Agent | `src/renderer/settings-dialog.ts:271` |
| P0-I 代码级 guard | **部分** | `src/main/external-change-guard-regression.test.ts` |
| §7.2 安装版 E2E / destructive drill | **未做**；只有源码级单测 | 无 drill 脚本 |

### 0.1 仍未做部分的建议顺序（用户 2026-09-14 认可“文稿安全很重要”后的排序）

1. **补齐决策面**：加「接受外部版本」与「查看 diff」。这是当前最便宜且用户可见的缺口——被拦下后只能否决，不能知情接受。
2. **append-only 事件日志**：07-09 事故最痛的一点就是无法从底层事实链重建“哪一次写入把正文打空”，只能靠屏幕录像与 OCR 反推。
3. **安装版 destructive drill**：事故里有一条是“旧实例继续用旧逻辑”，源码单测抓不到，只有 drill 能抓。
4. last-known-good 镜像；5. 事故包导出。6. 多窗口写入仲裁：除非同一文稿经常并行开两窗，否则先不做。

### 0.2 复核进展（2026-09-15，Cola 侧）

上节 1、2 两项已落地，实测基于当日 `main`（`npm test` 68 files / 503 tests 全绿，`npm run build` 通过）：

| 条目 | 2026-09-15 状态 | 证据 |
|---|---|---|
| 决策面「接受外部版本」「查看 diff」 | **已落地** | commit `5bf9a908`：主进程被拦下时随 `agent-change-summary` 携带 `fullSummary`（LCS diff，最多 200 行预览）；新 IPC `accept-external-change` 重新读盘并推进同步基线；面板在 `applyBlocked` 时显示两个新按钮，diff 可展开收起。取“就地看”形态，不新开窗口（Proma 提议，用户认可） |
| append-only 事件日志 | **已落地** | commit `2337631d`：`src/main/document-journal.ts`，JSONL 追加写 `~/.lyramd/document-journal.jsonl`，按 5MB 滚动切分（保留一份旧档），写失败不阻断保存链；覆盖 12 类事件（内外部保存、外部变更检测/被拦/接受/恢复、crash recovery 生成/恢复、revision 恢复），每条含时间戳、appVersion、前后 FNV-1a checksum/字数/行数、风险等级 |
| 安装版 destructive drill | **延后至下次发版** | 用户拍板： drill 依赖包含本轮改动的新安装包，拿 1.3.7 包做意义不大，等发版时一并做 |

另：`.codex/` 目录自 2026-09-15 起纳入版本控制（同批提交），本方案及交接文档不再游离在 git 外。当日曾短暂回退、最终仍采纳「放出来」；另有 zip 存档备份在仓库外 `~/Developer/PROJECT/lyramd-codex-docs-archive-2026-09-15.zip`。

## 1. 当前结论

### 1.1 事故对象

- 文稿：`/Users/cherry_xiao/Documents/LyraMD Drafts/draft-20260619-130539-16.md`
- 标题：`## 洛小山直播`
- 事故时间：`2026-07-09 21:55:58` 左右

### 1.2 当前恢复状态

- 主文件已从 `0` 字节恢复到 `188 行 / 8335 bytes`
- 恢复副本：`/Users/cherry_xiao/Documents/LyraMD Drafts/draft-20260619-130539-16.recovered-20260709.md`
- 旁证备份：
  - `draft-20260619-130539-16.empty-backup-20260709-2250.md`
  - `draft-20260619-130539-16.pre-undo-attempt-20260710-001107.md`

### 1.3 仍未恢复完整的部分

- `我还在想……` 后面原本还有一句，现有 Chronicle 关键帧只能证明它继续存在，但还不足以安全定稿。
- 最新局部放大与 Vision OCR 把这句的首个遮挡字进一步收窄到更像 `按`，但后续仍被统计浮层压住，不能据此直接写回正文。
- 从 Chronicle 右下角统计看，事故前文稿明显长于当前恢复版，所以中段仍可能缺若干正文。

结论：

- 现在不能宣称“100% 全文找回”。
- 但已经从“完全丢失”回到“主干可读、可继续人工使用、可继续比对恢复”的状态。

## 2. 这次事故真正暴露的问题

这不是一个单点 bug，而是五层防线同时失效。

### 2.1 文稿资产层没有独立 truth source

- 正文长期只活在当前文件 + 当前窗口内存里。
- 外部更新前没有强制写独立快照。
- 错过瞬时按钮后，就没有稳定恢复点。

### 2.2 destructive overwrite 被当成普通 external change

- `非空 -> 空`
- 大比例删行
- 大比例降字数

这些都属于 blast radius 极高的事件，但旧逻辑仍直接传播到正文。

### 2.3 恢复入口过短命

- 旧版“撤回这次更新”依赖 renderer 内存中的 `previousContent`
- 旧逻辑 `3s` 自动清空会话
- 没有 hover / focus 保活
- 没有跨重启恢复

### 2.4 运行态 truth source 不可见

- 磁盘上已经替换了修复版应用，不等于用户眼前运行中的窗口已获得修复
- 旧进程长时间不退出，会继续用旧逻辑处理高风险写入

### 2.5 发布与验收模型不完整

- 源码测试通过，不代表安装版、旧进程、多窗口、跨重启恢复真的成立
- 缺少 destructive overwrite drill
- 缺少“错过提示后还能恢复”的显式 gate

## 3. 已经落地的修复

以下修复已经进入仓库主线，不再只是提案。

### 3.1 已提交 commit

- `1d838403 Harden external update recovery`
- `83a0c0c1 Gate destructive external updates`
- `4ae57a16 Persist destructive external recovery`
- `e6e2f4ed Warn when installed app bundle is newer than running instance`

### 3.2 已落地能力

1. 外部更新前强制写 revision
2. “撤回这次更新”不再因 3 秒超时直接销毁上下文
3. destructive external change 会进入高风险路径
4. 外部覆盖前正文可单独落盘为 `external-change-recovery.json`
5. 应用启动后可读取并展示独立恢复面板
6. 当磁盘安装包比当前运行实例更新时，会提示用户重启应用
7. destructive external overwrite 已不会直接替换当前编辑器正文
8. destructive 事件到达时会立即刷新独立恢复面板与“已阻止覆盖”提示

### 3.3 当前已验证测试

执行命令：

```bash
npm test -- src/main/runtime-update-guard.test.ts src/main/updater-regression.test.ts src/main/sidebar-persistence.test.ts src/main/revision-store.test.ts src/renderer/agent-change-autodismiss.test.ts src/renderer/agent-change-panel-regression.test.ts src/main/agent-change-summary.test.ts src/main/external-change-risk.test.ts
```

结果：

- `8` 个 test files 通过
- `35` 个 tests 通过

后续新增最小回归：

```bash
npm test -- src/renderer/editor/content-sync.test.ts src/main/external-change-guard-regression.test.ts src/renderer/agent-change-panel-regression.test.ts src/main/external-change-risk.test.ts src/main/revision-store.test.ts
```

结果：

- `5` 个 test files 通过
- `30` 个 tests 通过

## 4. 还必须继续做的 P0 措施

下面这些不是“锦上添花”，而是要把“可恢复”从工程师视角变成用户视角的真正闭环。

先给结论：

- 现有修复完成了“止血”和“恢复入口持久化”。
- 但还没有完成“高风险外部写入不能直接落正文”这条真正的 P0 闭环。
- 因此下一轮实现重点不能再停留在“出事后还能救”，而要升级到“出事时默认先隔离、后决策”。

### 4.1 P0-A：destructive external change 改成两阶段提交

> **就地更正（2026-09-14 复核）**：本节「仍然允许高风险外部内容直接落正文」的判断已经过时，见第 0 章。`src/main/index.ts:1683` 的 `blockedDestructiveApply` 已做到“先隔离、不落正文”。本节四选一决策面中「接受外部版本」「查看 diff」已于 2026-09-15 落地（见 §0.2），「恢复覆盖前正文」「保留当前正文」此前已有。

当前虽然已经能备份和恢复，但仍然允许高风险外部内容直接落正文。

当前残留缺口（基于现有代码行为）：

- `watchFile()` 在拿到外部内容后，仍会先推进 `syncDecision.nextSyncedContent`
- destructive 风险判定发生在“已读到候选内容”之后
- 这意味着系统现在更像“先覆盖，再补救”，而不是“先隔离，再提交”

必须改成：

1. 检测到高风险 external change 时，先进入 `pending-external-change`
2. 当前正文继续保留在编辑器
3. 外部版本先存入候选区，而不是直接覆盖
4. 用户明确选择：
   - `接受外部版本`
   - `查看 diff`
   - `恢复覆盖前正文`
   - `保留当前正文`

验收标准：

- `非空 -> 空` 时，正文不能被静默清空
- 在用户做决定前，旧正文和候选正文都可见
- 在用户未确认前，磁盘当前文件、编辑器当前正文、候选外部版本三者的关系必须可解释
- 连续两次 destructive external change 到达时，后一次不能冲掉前一次唯一恢复点

### 4.2 P0-B：建立 append-only 文稿事件日志

仅靠 revision 快照还不够，需要事件级事实面。

每次以下事件都应写日志：

- autosave
- manual save
- external change detected
- external change accepted
- external change restored
- crash recovery generated
- revision restore executed

每条日志至少包含：

- 时间
- 文档 id / 路径
- 来源
- 前后 checksum
- 前后字数 / 行数
- 风险等级
- 触发实例信息

价值：

- 就算 UI 崩了，也能从底层事实链重建事故时间线
- 可以直接定位“哪一次写入把正文打空”
- 可以把 recovery/export/debug 从“猜发生了什么”变成“有证据链可回放”

实现要求：

- 只追加，不原地覆盖
- 单文档和全局都可检索
- 单条事件支持导出为事故包
- journal 文件损坏时，不能阻断正文保存链

### 4.3 P0-C：建立 last-known-good 镜像

不要让“当前文件、revision、renderer state”共生死。

需要为每份活跃文稿维护一个独立的 last-known-good 镜像：

- 仅在通过健康判定后更新
- 与当前文件分离存储
- 不参与普通 autosave 淘汰
- destructive 事件优先从这里恢复

推荐语义：

- 正常保存后更新
- 可疑 external change 前冻结
- 恢复成功后重建

最低不变量：

- 任何一次 destructive external change 发生时，必须至少同时存在：
  - 当前现场
  - 最近一次 revision
  - last-known-good
  - event journal 记录

### 4.4 P0-D：把文稿安全面板做成常驻能力

“外部更新”四个字不够表达风险。

应该有统一的“文稿安全”面板，至少展示：

- 事件来源：外部 agent / watcher / sync / crash
- 风险等级：普通 / 高风险 / destructive
- blast radius：删了多少字、多少行
- 恢复点：已保存在哪里
- 主操作：
  - `恢复覆盖前正文`
  - `查看 diff`
  - `打开备份目录`
  - `接受外部版本`

用户必须在 UI 上直接看懂：

- 发生了什么
- 丢了多少
- 系统替我保了什么
- 我下一步该点哪里

交互要求：

- destructive 场景默认展开，不自动折叠
- 面板关闭前必须经过显式动作，而不是仅靠失焦或超时
- 恢复动作完成后，面板要展示“恢复到哪个草稿、原文件是否保留现场”

### 4.5 P0-E：运行态实例必须可见

需要把“当前运行实例是不是修复版”从工程事实变成用户可见事实。

建议补充：

1. 设置页显示：
   - 当前进程启动时间
   - 当前包版本 / build hash
   - 磁盘安装包版本 / build hash
2. 如果运行实例旧于磁盘安装包：
   - 明确提示“你当前运行的是旧实例，文稿安全修复尚未生效”
3. 高风险场景下禁止沉默

更强要求：

- 如果当前运行实例不具备文稿安全修复，启动时就应该给出阻断级提示
- 对承载正式文稿的窗口，旧实例不应继续静默处理 destructive external change

### 4.6 P0-F：多窗口 / 多来源写入仲裁

后续如果同一文稿可能被：

- 主窗口
- 次窗口
- 外部 agent
- 同步器
- 恢复面板

同时写入，就不能只靠最后写入者获胜。

必须有仲裁规则：

1. 高风险 external candidate 不直接覆盖
2. 同一文档同一时间只允许一个 destructive 决策面
3. 同一恢复点不能被后续普通 autosave 立即冲掉

建议数据结构：

- `document lease`
- `pending destructive decision id`
- `candidate source`
- `active recovery point ids`

### 4.7 P0-G：恢复默认进入新草稿，而不是原地覆盖

恢复动作要优先安全，而不是图省事。

建议：

- 默认恢复为新草稿
- 原文件保留现场
- 用户可手动替换原文件

这样可以避免“恢复动作又覆盖掉新的唯一证据”。

补充要求：

- 新草稿名字里应带恢复来源与时间
- 恢复成功后自动提供“打开恢复草稿”和“对比原文件”

### 4.8 P0-H：给 destructive 事件做事故包导出

用户遇到事故时，不应该靠手工翻目录找证据。

至少支持一键导出：

- 当前文件现场
- 最近 `N` 个 revisions
- `external-change-recovery.json`
- `crash-recovery.json`
- event journal 片段
- 运行实例信息
- 最近一次风险摘要

价值：

- 降低二次破坏概率
- 方便本机恢复、跨人协查、issue 附件和回归复盘

### 4.9 P0-I：把“正文安全不变量”写成代码级 guard

不要只靠测试名或文档约定。

至少要有以下 guard：

1. `非空 -> 空` 且来源不是用户显式清空时，禁止 silent apply
2. destructive external candidate 未确认前，禁止覆盖 current editor state
3. destructive recovery state 未持久化成功时，禁止宣称“可恢复”
4. 恢复点为空时，UI 不能误导用户点“恢复覆盖前正文”

## 5. 产品与交互层必须改的地方

### 5.1 文案要升级

不要只写：

- `外部更新`

应该写成：

- `外部更新删除了 824 行正文`
- `已自动保存覆盖前版本，可一键恢复`

### 5.2 默认动作要保守

对 destructive 场景，默认主按钮应该是：

- `恢复覆盖前正文`

而不是：

- `知道了`
- 自动关闭

### 5.3 恢复入口不能只有一条

至少要同时存在：

1. 即时提示恢复
2. 文稿安全面板恢复
3. revision 恢复
4. 直接打开磁盘恢复目录

### 5.4 用户要知道“现在是否安全”

产品不能把“已经修过”和“当前这只窗口正在用修复版”混为一谈。

至少要显式展示：

- 当前窗口是否具备 destructive guard
- 当前文档最近一次健康保存时间
- 当前文档最近一次 last-known-good 时间
- 当前文档是否存在待决外部候选版本

## 6. 工程与存储层建议

### 6.1 存储分层

建议把文稿安全数据分为四层：

1. `current file`
2. `revision snapshots`
3. `external-change-recovery state`
4. `append-only event journal`

原则：

- 恢复链不能只依赖任何单一层
- 任一层失效时，仍应有第二条链可走

### 6.2 数据模型最低要求

对 revision / recovery / journal 统一记录：

- `documentId`
- `documentPath`
- `timestamp`
- `source`
- `reason`
- `riskLevel`
- `contentHash`
- `wordCount`
- `lineCount`
- `summaryPreview`

### 6.3 淘汰策略

普通 autosave 与 destructive 事件不能共用同一淘汰桶。

最低要求：

- destructive snapshots 保留最近 `N` 次
- crash / external / restore 事件优先级高于普通 autosave

建议保留策略：

- autosave revisions：最近 `40`
- destructive snapshots：最近 `20`
- crash recovery：最近 `10`
- event journal：默认长期保留，按大小滚动切分，不按次数淘汰

### 6.4 数据一致性要求

至少要避免以下“半写成功”状态：

1. revision 已写，但 recovery state 没写
2. recovery state 已写，但 UI 摘要显示为空
3. editor 已切到新内容，但 journal 未记录
4. 恢复草稿已生成，但 sidebar 未同步

建议：

- 对 destructive 事件采用 write-ahead 顺序
- 明确 commit point
- 所有恢复动作返回可验证结果，而不是只返回 `true/false`

## 7. 测试与发布 gate

### 7.1 单元测试之外必须补的场景

1. `非空 -> 空`
2. 非空大幅删行但未完全清空
3. 错过提示后恢复
4. 关闭窗口后恢复
5. 重启应用后恢复
6. 多窗口同时打开同一文稿
7. 连续两次 destructive external change
8. 旧实例 + 新安装包并存

### 7.2 必须新增安装版 E2E

不能只测源码 dev runtime。

至少要验证：

1. 打包 app 安装到 `/Applications`
2. 启动旧实例
3. 替换安装包
4. 再触发 destructive external change
5. 断言系统明确提示“当前实例未更新”

### 7.3 发布 gate

只有以下都通过，才能说 P0 真修住了：

1. 外部清空不会静默落正文
2. 错过即时提示仍可恢复
3. 重启后仍可恢复
4. 恢复后 checksum 与覆盖前一致
5. 安装版与运行态差异有显式提示
6. 多窗口下恢复链不丢失

### 7.4 必须新增的 proof pack

每次改动文稿安全链，默认附：

1. 一次 `非空 -> 空` drill 的前后截图
2. 对应磁盘恢复文件存在性的命令输出
3. 恢复到新草稿后的 checksum 对比
4. 旧实例 / 新安装包并存时的提示截图

如果没有这四样证据，就不能说“P0 修住了”。

## 8. 事故 runbook

以后再出现类似事故，排查顺序必须标准化：

1. 先冻结现场，不要继续写原文件
2. 复制当前文件与空文件现场
3. 查：
   - `~/.lyramd/revisions`
   - `external-change-recovery.json`
   - `crash-recovery.json`
4. 查当前运行实例启动时间与安装包时间
5. 查 Chronicle / 屏幕记录 / OCR
6. 恢复结果先写到新草稿
7. 原文件保留
8. 输出“已确认恢复 / 部分恢复 / 未恢复”的分层结论

补充纪律：

- 恢复期间不要继续把猜测写回唯一主稿
- 所有不确定句子必须明确标注“证据不足”
- 先保全现场，再优化文本可读性

## 9. 对这次事故的最终判断

### 9.1 已经做到的

- 文稿不是空文件了
- 主干恢复回来了
- 一批关键中后段正文已找回
- 修复链已经进入仓库与测试

### 9.2 还没做到的

- 不能证明全文 100% 恢复
- 还没把所有安装态 / 运行态 / 多窗口 / 两阶段提交场景都变成强 gate

### 9.3 因此当前状态

这次事故的恢复工作：

- `部分恢复，仍需继续`

这次事故的系统修复工作：

- `已做关键止血，但还没达到“同类 P0 彻底封口”的标准`

## 10. 下一步优先级

### 最高优先级

1. 继续从 Chronicle 与本机证据面追剩余正文
2. 把 destructive external change 改成两阶段提交
3. 补安装版 E2E 与 destructive overwrite drill

### 第二优先级

1. append-only event journal
2. last-known-good 镜像
3. 多窗口 / 多来源写入仲裁

### 第三优先级

1. UI 文稿安全面板统一化
2. 用户可见运行态版本信息
3. 标准化事故导出包

## 11. 按时间分层的落地路线

### 11.1 `24h` 内必须完成

1. destructive external change 两阶段提交设计定稿
2. 旧实例 / 新安装包提示做成阻断级文案
3. destructive overwrite drill 变成固定脚本
4. 事故包导出最小版本可用

### 11.2 `72h` 内必须完成

1. 两阶段提交主链路落地
2. append-only journal 落地
3. last-known-good 镜像落地
4. 安装版 E2E 跑通并存档 proof pack

### 11.3 `1w` 内必须完成

1. 多窗口 / 多来源仲裁第一版
2. 文稿安全面板统一化
3. 数据淘汰与恢复保留策略稳定
4. 事故导出包纳入发布验收

## 12. 一句话要求

对于 LyraMD 这种承载长文稿与个人思考资产的产品：

高风险外部写入必须默认“可恢复、可解释、可验证”，而不是默认“先覆盖，再让用户赌自己点得够快”。
