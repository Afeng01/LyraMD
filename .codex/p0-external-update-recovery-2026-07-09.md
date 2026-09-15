# LyraMD P0 事故记录：外部更新导致草稿被清空

此文件帮助 agent 和人类快速理解 2026-07-09 的一次 P0 文稿安全事故，包含恢复现状、根因、已落地修复、以及后续必须执行的措施。

## 事故对象

- 草稿文件：`/Users/cherry_xiao/Documents/LyraMD Drafts/draft-20260619-130539-16.md`
- 草稿标题：`## 洛小山直播`
- 事故时间：`2026-07-09 21:55:58` 左右

## 已确认事实

1. 原草稿文件在事故后被写成了 `0` 字节。
2. LyraMD 当时弹出了“外部更新”面板，并提供“撤回这次更新”按钮。
3. 该撤回入口依赖 renderer 内存中的 `agentChangeSession.previousContent`。
4. renderer 原实现会在 `3s` 后自动调用 `clearAgentChangePanel()`，把 `agentChangeSession = null`。
5. `watchFile()` 在收到外部文件变化时会把 `previousContent` 传给 renderer，但不会先把 `previousContent` 落入本地 revision 链。
6. 本次事故中，`~/.lyramd/revisions` 里没有这篇 `draft-20260619-130539-16.md` 的可用 revision 链；现存 revision 目录实际对应的是另一篇旧测试草稿。
7. 本次事故中，`~/.lyramd/external-change-recovery.json` 也没有留存下来，说明“错过按钮之后的持久恢复入口”当时并未真正落盘。
8. `~/Library/Application Support/lyramd` 里的 `Local Storage` / `Session Storage` / `Preferences` 没有这次事故对应的可恢复正文或 `previousContent`；现有内容仅能证明这是 Electron 宿主目录，不能作为这次恢复的正文 truth source。
9. 打包前端代码确认旧逻辑里“撤回这次更新”只是调用 `restoreAgentChangeSession()`，把内存里的 `previousContent` 重新写回正文；并不存在独立持久化恢复链。
10. 事故发生时，用户实际运行的是一只从 `2026-06-22 15:30:15` 持续运行至今的旧 LyraMD 进程；`2026-07-09 23:35` 替换到 `/Applications/LyraMD.app` 的修复版并不会自动影响这只未重启的旧进程。

## 根因拆解

这次不是单点 bug，而是三层防线同时失效：

### A. 触发层：destructive external write 可以直接传播到正文

- 外部 agent 把文件写成了空内容或近似空内容。
- watcher 把这次变化当成普通外部更新处理，允许它直接覆盖当前文稿。
- 在 blast radius 已经明显异常时，没有进入“待确认 / 隔离应用”路径。

### B. 恢复层：即时撤回依赖短寿命 renderer 内存

- “撤回这次更新”依赖 `agentChangeSession.previousContent`。
- 老实现 `3s` 后会直接 `clearAgentChangePanel()`，连同回滚上下文一起销毁。
- 主进程没有先把覆盖前正文写成稳定 revision，也没有把 destructive 恢复态单独落盘。

### C. 运行层：磁盘上的修复包不等于用户眼前进程已升级

- `/Applications/LyraMD.app` 已被替换为修复版，但旧进程未退出。
- 用户看到的仍是旧版逻辑：有短暂按钮，但没有持久恢复面板。
- 这意味着“已修复”如果只停留在源码、打包产物或磁盘安装包层面，还不够；必须把“当前运行中的实例”也纳入 truth source。

## 本机证据

- Chronicle 屏幕记录确认草稿在被清空前一两分钟仍有正文，且字数约在 `10312-10363 字`、`823-825 行`。
- `frame-000124-2026-07-09T13-55-00Z.jpg` 与 `frame-000125-2026-07-09T13-55-00Z.jpg` 进一步确认：
  - 事故前正文规模约为 `10355-10356 字`、`15907-15912 字符`、`823-825 行`
  - `执行迭代的过程中...`、`工程思维如何形成的...`、`比如你习惯去创造...` 等主干仍存在
- `frame-000104-2026-07-09T13-54-00Z.jpg`、`frame-000118-2026-07-09T13-54-00Z.jpg` 与 `frame-000119-2026-07-09T13-55-00Z.jpg` 的高清直看进一步确认：
  - `比如我要积累什么，然后在哪些方面要做的比别人好等等。`
  - `逻辑链条更紧密，同时更落地一点，去做就可以了。你要更清晰，这个逻辑链条，百分百能够导向另一个结果，你想要的结果的，那才可以。`
  - `比如你要学英语，原因是未来出国旅游的时候，能够更便利一点。但问题是，这个真的是你想要的吗？真的有必要吗？比如我可以出国的时候带个翻译器，那不就得了。所以可能执行的过程中，就断掉了。`
  - 上述三句在事故前最后十分钟内都仍然存在于原稿，不是恢复阶段的二次猜测。
- `frame-000133-2026-07-09T13-55-00Z.jpg` 明确显示：
  - “外部更新”面板
  - “撤回这次更新”按钮
  - 当前文稿已退化为 `1 字 · 5 字符 · 1 行`
- `2026-07-09T13-59-01...` 分钟目录中的 `frame-000002-2026-07-09T13-59-00Z.jpg` 已经显示 LyraMD 回到空白编辑器：
  - `What do you want to write today?`
  - `0 字 · 0 字符 · 0 行`
  - 没有“外部更新”或“恢复覆盖前正文”面板
  - 这说明即时回滚会话在 `21:59` 前已经完全蒸发，且旧版本没有留下可见的持久恢复入口
- `2026-07-09T14-01-31...` 与 `2026-07-09T14-11-22...` 的 Chronicle 片段已再次排查：
  - `14:01` 之后主要是 Codex 排障现场和“为什么按钮消失了”的后续调查，不再是这篇草稿的正文来源
  - `14:11` 的 OCR 也主要是恢复调查对话和空白编辑器现场，不是原稿补全文本来源
  - 因此目前 `13:14 / 13:29 / 13:44 / 13:59` 仍是与这篇稿子最相关的四段有效 Chronicle 证据面
- 从打包前端代码与临时解包产物可直接确认旧实现细节：
  - 面板 DOM 确实包含 `撤回这次更新`
  - `createAgentChangeAutoDismiss()` 的默认超时时间是 `3e3`
  - 超时回调会执行 `clearAgentChangePanel()`
  - `clearAgentChangePanel()` 会把 `agentChangeSession = null`
  - `restoreAgentChangeSession()` 只会把 `agentChangeSession.previousContent` 写回正文，然后立即清空面板
  - 代码里没有针对该面板的 hover / focus 保活逻辑
- `10:36` 与 `10:21` 的 Chronicle 帧进一步确认了后续段落的更准确顺序和措辞：
  - `2、可以让agent来根据文中讲到的内容，去拆分开来发推特`
  - `2026年07月05日21:51:38` 位于 `don哥的skill的使用 / 小红书的运营` 之后
  - `~~~` 分隔线确实存在于娱乐段之间
- OCR 与人工复核确认草稿主干内容至少包括：
  - `请辩直播，做成任何事的原理`
  - `兰王，生日快乐呀。`
  - `如果有调整的话，先改回到 PRD，然后再进行代码的生成；`
  - `洛小山的直播，让我感觉，可能 Cola 也是 20 多万的代……`
- `13:25-13:27` 的连续关键帧进一步确认了中段顺序：
  - `2026年07月09日18:24:54`
  - `8块钱的汉堡，100和800多`
  - `FIRE的账户，现在一分钱没有。`
  - `--`
  - `2026年07月09日21:25:35`
  - 第二段 `请辩直播，做成任何事的原理` 确实先于 `兰王，生日快乐呀。`
  - 且这段请辩在 `13:26-13:27` 的帧中继续增长到至少 `1、定义问题 / 2、工程化拆解 / 所有的问题本质上都是工程问题 / 从器官拆解到原子核（因素）`

## 已完成恢复

- 已把恢复主干写回原文件：
  - `Documents/LyraMD Drafts/draft-20260619-130539-16.md`
- 已保留两个旁证文件：
  - `Documents/LyraMD Drafts/draft-20260619-130539-16.empty-backup-20260709-2250.md`
  - `Documents/LyraMD Drafts/draft-20260619-130539-16.recovered-20260709.md`
- 截至 `2026-07-10 00:39` 左右，恢复文件体量已增长到：
  - 主文件：`188 行 / 8335 bytes`
  - 恢复副本：`196 行 / 9122 bytes`

注意：

- 当前恢复版不是 100% 完整原文。
- 当前状态是“主干正文 + 多段连续后续内容 + 已确认碎片已经救回”，比事故后的空文件强很多，但仍可能缺少部分中段或尾段。
- 截至当前，已确认并补回的内容包括：
  - `请辩直播，做成任何事的原理`
  - `2026年07月05日21:51:38`
  - `1、研究几个固定博主的账号，然后互动，然后发文`
  - `天策`
  - `我真的好想有他们这种精力和活力，`
  - `大会`
  - `镜子`
  - `跳过动画`
  - `兰王，生日快乐呀。`
  - `感觉推特还是很好起号的，1000 粉以下基本上靠大量的互动就可以，我还在想……`
  - `如果有调整的话，先改回到 PRD，然后再进行代码的生成；`
  - `洛小山的直播，让我感觉，可能 Cola 也是 20 多万的代……`
  - `2026年07月09日21:25:35`
  - `codex 一分钟帮我找出来我想要的内容，然后我花了 15 分钟，都没有一个头绪，反而越找越乱，我觉得这是我需要反思的一点。`
  - `记忆承载的文章，我现在可以和 cola 一起分享、阅读、然后讨论，看看能不能保存到本地，然后指导生活实践。`
  - `cola 的定时任务需要有调整，因为 codex 那边有更新了，要不然还是一直花钱，两天就花 1 块 4 了。`
  - `4、推特需要有一个主线，不管是什么，先坚持 30 天，或者你还有其他思路`
  - `5、热点要怎么找、怎么检测？`
  - `6、现在 5x 我感觉已经不够用了，但是 20 就有点富余，你还要继续用 codex 嘛，要的我觉得`
  - `7、发帖，关于 taste`
  - `8、坚持，关于看书`
  - `产品开眼日志、GitHub 开源库研究，idea 不值钱，值钱的是行动。`
  - `还是要多看项目，多学知识。困扰了我半个月的问题，终于在躺床上休息的时候，有了一个初步的解决方法。编辑器如何和 Agent 打通。`

- 当前仍未可靠补全的关键缺口：
  - `我还在想……` 后面原本还有一句，但在 Chronicle 关键帧里被右下角统计浮层遮挡，现阶段仍不能可靠补全整句。最新局部放大至少能确认这句继续显示为 `我还在想接…` 一类提手旁开头，不再是完全未知，但仍不足以安全写回完整正文。
  - 从 Chronicle 字数统计看，事故前文稿仍显著长于当前恢复版，说明除了尾句之外，中间仍可能缺少若干未被现有帧覆盖到的正文。

补充：

- `/tmp/lyra-tailtriplet/frame-000158-2026-07-09T13-25-00Z-tail-6x.png` 是目前对尾句最清晰的局部证据。
- 该图与旧 OCR 聚合结果共同支持：
  - 句子并未停在 `我还在想……`
  - `想` 后面至少还有一个提手旁形状的字
  - 在本轮局部 4x 放大图和 Vision OCR 中，这个字更偏向 `按`，弱于“可以安全定稿”的标准，但强于此前的 `接 / 按` 并列不确定状态
  - Vision OCR 当前最接近的本机读数仍只是 `我还在想按！...` / `我还在想把` 这一层，后续字形仍明显失真，不能当正文写回
- `2026-07-09T13-14-31.992849+00-00-display-1` 这段只保留了 Chronicle 分钟帧，没有同名原始 `.ocr.jsonl` 可进一步榨取；因此这条尾句当前仍只能依赖图像层和本机二次 OCR，而没有额外的一手文本缓存可补。
- 但浮层遮挡仍覆盖了后面更多字，现阶段不能把 OCR 的噪声串安全写回正文。

## 当前恢复结论

截至 `2026-07-10 00:30` 左右，可以确认：

1. 原文件不再是空文件，主干正文已经写回。
2. 一批此前顺序有误或措辞存疑的段落，已根据原帧修正为更高置信版本。
3. 但还不能声称“100% 恢复原文”。

当前最合理的状态描述是：

- `可读主干`：已经救回。
- `多段连续后续内容`：已经救回，且顺序精度继续提升。
- `完整原文`：仍未证明。

这意味着此事故的“恢复”工作仍应继续，但当前文件已经从 `0` 字节灾难状态回到“可继续人工使用与比对”的状态。

## 风险定级

这次事故必须按 `P0` 看，不是普通编辑器 bug。

原因：

1. 直接打到了用户最核心资产：正文本身。
2. 触发方式不需要复杂条件，只要外部写入异常即可复现同类损害。
3. 用户错过一个短暂 UI 动作后，恢复链几乎断裂。
4. 事故后没有稳定、清晰、可信的“最近可恢复版本” truth source。

如果不继续补措施，这类事故会在以下场景反复出现：

1. 外部 agent 写空文件。
2. 外部 agent 写错文件路径。
3. 外部 agent 以合法路径覆盖错误 draft。
4. watcher / sync 链路误把临时中间态当最终态传播。

## 已落地修复

### 修复 1：外部更新前强制落本地 revision

修改文件：

- `src/main/index.ts`
- `src/main/revision-store.ts`

行为变化：

1. `watchFile()` 在确认外部内容需要传播前，会先把 `previousContent` 记录为 revision。
2. 新增 revision reason：`external-change`
3. UI 中对应标签显示为：`外部更新前备份`

结果：

- 即使用户错过了即时“撤回”按钮，仍可从“最近备份”恢复外部覆盖前的正文。

### 修复 2：3 秒超时只收起提示，不再销毁撤回状态

修改文件：

- `src/renderer/main.ts`

行为变化：

1. 自动超时回调改为 `collapseAgentChangePanel()`
2. 面板超时后只折叠，不再清空 `agentChangeSession`
3. `撤回这次更新` 依赖的 `previousContent` 仍保留，直到用户明确 dismiss 或文档上下文切换

结果：

- 用户就算没在 3 秒内点击，也不会立刻失去回滚上下文。

### 修复 3：对 destructive external change 提升为文稿安全事件

修改文件：

- `src/main/external-change-risk.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/agent-change-session.ts`
- `src/renderer/main.ts`

行为变化：

1. 新增统一风险判定：
   - `非空 -> 空`
   - 字数骤降 `>= 60%`
   - 删除行数达到明显阈值
2. 风险判定结果随 `agent-change-summary` payload 一起进入 renderer。
3. 一旦命中 destructive risk：
   - 外部更新提示默认展开；
   - 不再自动 dismiss；
   - 自动打开“文稿安全 / 最近备份”面板。

结果：

- 高风险外部覆盖不再只是一个普通的短寿命提示，而会直接升级成用户可见、可恢复的安全事件。

### 修复 4：把 destructive external change 的恢复入口落盘，跨重启保留

修改文件：

- `src/main/revision-store.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/index.html`
- `src/renderer/main.ts`
- `src/renderer/themes/base.css`

行为变化：

1. 新增 `external-change-recovery.json`，专门保存最近一次高风险外部覆盖前的正文快照。
2. 主进程在命中 destructive risk 时，除了写 revision，还会把恢复态单独落盘。
3. renderer 启动时会主动读取这份状态。
4. 即使错过即时提示、甚至中途重启应用，用户仍可通过独立面板执行：
   - `恢复覆盖前正文`
   - `先忽略`

结果：

- 这条恢复链不再只依赖当前 renderer 内存，也不再只依赖用户刚好看到提示并及时点击。

### 修复 5：运行时守卫已提交并通过测试，但安装版尚未完成最终切换

### 修复 6：destructive external overwrite 不再直接落当前正文

新增 commit：

- `38c8aa77 Block destructive external overwrites from applying live`
- `246077c9 Clarify blocked destructive updates in recovery UI`

行为变化：

1. 主进程在判定 `destructive external change` 后，不再把候选内容直接推入当前编辑器正文。
2. 当前正文继续保留为覆盖前版本。
3. renderer 仍会收到高风险摘要，因此用户可以看到“外部更新试图清空/大幅缩短文稿”的提示，而不是误以为系统静默无事发生。
4. destructive 事件到达时，会立即刷新独立恢复面板，而不需要重启应用才看到 `external-change-recovery.json` 对应的入口。

当前边界：

- 这仍然不是完整的“两阶段提交”。
- 当前实现更接近“先保住 live 正文，再暴露恢复入口与安全提示”。
- 后续仍需补“查看候选版本 / 明确接受外部版本 / 保留当前版本”的正式决策流。

当前真实状态必须分开写：

1. 仓库里已经补上“当前运行实例过旧提示”的运行时守卫。
2. 对应 commit：
   - `e6e2f4ed Warn when installed app bundle is newer than running instance`
3. 已验证通过的新增测试包括：
   - `src/main/runtime-update-guard.test.ts`
   - `src/main/updater-regression.test.ts`
   - `src/main/sidebar-persistence.test.ts`
4. 当前打包产物：
   - `release/mac-arm64/LyraMD.app/Contents/Resources/app.asar`
   - `sha256 = 01ccd6708fdfd98954ee46452f941a71689187f0e072812446f2bbb5432e29ba`
5. 当前 `/Applications/LyraMD.app` 仍是旧包：
   - `sha256 = d9571450cd17be514ed165c967f7a40841939bc2e78f0a847d18d5a70c9ec896`
6. 同时，用户眼前运行的仍是 `2026-06-22` 启动的旧进程。

结果：

- “源码已修 + 新包已构建” 已经成立。
- “安装版已切到新包并重启到新进程” 目前还没有成立，不能误记为已完成。

## 已验证

已跑通过的针对性测试：

- `src/main/revision-store.test.ts`
- `src/renderer/agent-change-autodismiss.test.ts`
- `src/renderer/agent-change-panel-regression.test.ts`
- `src/main/agent-change-summary.test.ts`
- `src/main/external-change-risk.test.ts`
- `src/renderer/agent-change-session.test.ts`
- `src/main/runtime-update-guard.test.ts`
- `src/main/updater-regression.test.ts`
- `src/main/sidebar-persistence.test.ts`

命令：

```bash
npm test -- src/main/revision-store.test.ts src/renderer/agent-change-autodismiss.test.ts src/renderer/agent-change-panel-regression.test.ts src/main/agent-change-summary.test.ts src/main/external-change-risk.test.ts
npm test -- src/main/runtime-update-guard.test.ts src/main/updater-regression.test.ts src/main/sidebar-persistence.test.ts
```

## 后续必须执行的措施

以下按优先级排序。

### P0.1 必做：destructive external update 进入隔离模式，而不是直接落正文

当前已经做了“先落备份 + 可恢复”，但对 `非空 -> 空` 这类 blast radius 极高的情况，还应该更进一步：

1. 先把覆盖前正文写入 immutable snapshot。
2. 再把外部版本作为 `pending destructive update` 挂起，而不是立即替换编辑器正文。
3. UI 必须给出两个主操作：
   - `接受外部版本`
   - `保留当前正文 / 恢复覆盖前版本`
4. 对 `非空 -> 空`、`删除 > N 行`、`字数骤降 > X%` 应默认走这条路径。

原则：

- 普通外部改动继续顺滑协作。
- 高风险外部改动必须从“同步问题”升级为“文稿安全事件”。

### P0.2 必做：把“外部覆盖恢复”提升为独立安全面板能力

当前已修的是“不会瞬间蒸发”，但还不够。

必须继续做：

1. 为 destructive external change 提供更显眼的恢复入口。
2. 当外部更新把非空文稿改成空文稿，或删除行数达到阈值时，自动展开“文稿安全”面板。
3. 在最近备份列表里高亮最近一次 `external-change` 快照。
4. 面板文案必须直接说明风险，例如：`外部更新删除了 824 行，已自动保存覆盖前版本，可一键恢复。`
5. “恢复到覆盖前版本”要从普通提示按钮升级为常驻可见主操作，不应埋在临时 toast 行为里。

### P0.3 必做：给 destructive change 单独加 gate

当满足以下任一条件时，不应像普通外部更新一样静默应用：

1. 非空 -> 空文件
2. 总字数骤降，例如 `>60%`
3. 删除行数达到明显阈值，例如 `>50 行`

建议行为：

1. 先落 revision。
2. 再显示强提示。
3. 在用户明确确认前，不自动吞掉“可恢复”的视觉状态。
4. 如果是 `非空 -> 空`，默认进入“隔离应用”模式：
   - 编辑器先保留内存中的旧正文；
   - 外部版本只进入待确认态；
   - 用户可选“接受外部版本”或“恢复旧版本”。

这一步的原则不是“永远阻止外部更新”，而是：

1. 允许外部 agent 正常工作。
2. 但当 blast radius 明显上升时，必须改走安全路径，而不是继续按普通 diff 提示处理。

### P0.4 必做：建立 append-only shadow journal，不再只靠 revision 面板

`revision` 是用户面恢复入口，但从事故韧性角度，还应该再加一层更底的日志面：

1. 每次本地保存、自动保存、外部更新前，都写一份 append-only snapshot。
2. 该日志不做“覆盖写回”，只新增，不复用同一文件名。
3. destructive external change 额外写一份 `incident snapshot`，单独打标签。
4. 日志文件要和 UI revision 分离，避免 UI 数据结构或清理策略把最关键证据一起删掉。
5. 至少保留最近 `N` 次 destructive / crash / restore 事件，不应与普通 autosave 共用同一淘汰权重。
6. append-only journal 需要同时记录：
   - `document identity`（draft id / file path）
   - `source`（autosave / save / external-change / restore / crash）
   - `content hash`
   - `line count / char count`
   - `previous snapshot pointer`

这条是本轮新增的强结论：因为这次真正缺失的不是“有没有某个 UI 按钮”，而是底层没有留下独立、稳定、可核对的事故前正文 truth source。

目标：

- 就算 UI 面板坏了，仍有底层 truth source 可直接恢复。

### P0.5 必做：把“当前运行实例是不是修复版”做成可见事实

这次的一个隐性坑是：磁盘上的 app 已换新，但正在跑的还是老进程。

必须补：

1. 在设置或标题栏显示当前运行实例的 build id / commit。
2. 安装包被替换后，下次前台激活或空闲时提示：`检测到磁盘上的 LyraMD 已更新，当前窗口仍在运行旧版本，建议重启应用以启用文稿安全修复。`
3. 提供一键：
   - `稍后重启`
   - `保存并重启`
4. 发布和验收时把 “asar 已替换” 与 “运行进程已重启到新 build” 分开验证。

### P0.6 必做：增加真实安装版 E2E 回归，不只跑源码测试

这次证明了：只跑单测和源码态集成测试，不足以覆盖实际安装使用面。

必须增加的验收链：

1. 从打包后的安装版启动应用。
2. 打开真实 `.md` / draft。
3. 通过外部脚本模拟：
   - 原地写入
   - `write tmp && rename`
   - 写空文件
   - 错路径覆盖
   - 连续多次 destructive update
4. 验证：
   - 主正文是否被直接清空
   - revision 是否落盘
   - destructive recovery 是否跨重启保留
   - “撤回 / 恢复”是否在超时后仍可用
5. 对安装版做 smoke，不只对 repo 里的 dev build 做 smoke。

### P0.7 必做：把恢复链路做成用户可理解的操作模型

现在恢复入口分散在：

- 即时外部更新提示
- 文稿安全 / 最近备份
- crash recovery
- destructive external recovery

这对工程上成立，但对用户脑模型还不够简单。

建议统一成下面四个问题：

1. `刚刚这次外部更新不对，怎么立刻回去？`
2. `刚才错过了按钮，现在怎么找回来？`
3. `重启过应用之后，还能不能找回？`
4. `这次恢复会不会覆盖我当前文件？`

然后确保 UI 每个入口都能明确回答这四个问题。

### P0.8 必做：补值守与操作纪律

即便产品修到位，操作面也要补几条最低纪律：

1. 替换安装版后，必须重启正在运行的 LyraMD。
2. P0 安全修复发布后，要核：
   - `磁盘安装包版本`
   - `当前运行进程启动时间 / build id`
3. 用户写高价值正文时，默认开启：
   - draft 托管
   - 最近备份保留
   - destructive external recovery
4. 出现“回退后怎么又回去了”这类问题时，优先查自动同步源 / 外部 agent / watcher，而不是只盯编辑器表面。
5. 对 P0 修复验收，必须新增一条显式检查：
   - `~/.lyramd/revisions` 或等价持久目录里，事故对象文稿是否真的产生了对应快照
   - `external-change-recovery.json` 或等价恢复态是否真的写入并可跨重启读取

## 本轮新增已落地措施

### 运行实例过旧提示

已经在主进程补上一个新的运行时守卫：

1. 定时检查当前运行实例的启动时间与磁盘上 `app.asar` 的更新时间。
2. 如果检测到“安装包已被替换为较新版本，但当前窗口仍在运行旧实例”，会弹出明确提示：
   - `LyraMD 安装包已更新`
   - `当前窗口仍在运行旧实例`
3. 提供 `重启应用 / 稍后` 两个动作，避免用户把“磁盘已换新”误当成“当前安全修复已生效”。

这条措施直接针对本次事故中的隐藏根因：修复版虽然已经替换到 `/Applications/LyraMD.app`，但用户眼前实际运行的仍是旧进程。

## 建议的收口标准

这次事故不能以“文件不再是空的”作为完成条件，至少要满足下面几条，才算真正收口：

1. 当前恢复文件达到“可读主干 + 已知连续段落基本就位”的状态。
2. destructive external update 至少有两条独立恢复链：
   - revision / 文稿安全入口
   - append-only shadow journal
3. 高风险外部覆盖不再直接静默应用。
4. 安装版与运行版的版本错位可以被用户看见。
5. 打包产物级别的 E2E 回归可以稳定复现并验证上述行为。

### P0.3 必做：增加集成测试

当前测试主要覆盖静态逻辑与 renderer 行为，缺少这次事故真正踩中的跨进程链路。

必须补：

1. 打开一个非空 draft。
2. 从外部进程把文件改成空文件。
3. 断言主进程先写 `external-change` revision。
4. 断言 renderer 进入 destructive recovery UI。
5. 断言错过即时提示、关闭窗口、重开应用之后，仍然能恢复覆盖前正文。
6. 断言恢复后正文与覆盖前 checksum 一致。

否则现在的修复仍然有“单点逻辑通过，但真实链路又掉了”的风险。

### P0.4 必做：把 destructive external update 改成“两阶段提交”

这是比普通 revision 更高一级的安全措施，建议后续版本做。

目标：

1. 外部写入先进入 `staged external version`。
2. 编辑器 UI 展示 diff、来源、风险等级。
3. 对低风险变更允许自动接受。
4. 对高风险变更默认保留当前正文为 active version，把外部版本置为待确认。
5. 用户明确点“接受外部版本”后，才切换 active version。

这样就算外部 agent 写空文件，也不会第一时间把用户正在编辑的真实正文打掉。

### P0.5 必做：引入 append-only 文稿事件日志

现在 revision 是快照式的，但对于 P0 文稿安全，还需要更底层的可追溯日志。

建议单独维护一条本地 append-only 日志，例如：

```text
timestamp
document id
source: user | external-agent | watcher | crash-recovery | title-sync
operation: save | external-overwrite | restore | accept-staged-version
before checksum
after checksum
before char count
after char count
```

价值：

1. 事故后能更快确认是谁写坏了文件。
2. 可以做自动风险判定和异常聚类。
3. 可以生成面向用户的“刚刚发生了什么”时间线，而不是只剩一个 toast。

### P0.6 必做：建立 last-known-good 镜像，不与当前文件共生死

只靠主文件 + revision 目录还不够，建议再加一层独立的最近稳定镜像：

1. 文档打开时记录 `last-known-good`。
2. 空闲 15-30 秒且内容非空时刷新。
3. 关闭窗口前刷新。
4. 外部 destructive change 命中时，绝不覆盖这份镜像，直到用户明确接受。

这份镜像应该：

1. 和当前文件分开存放；
2. 带时间戳；
3. 带 checksum；
4. 可以在主文件、revision、renderer state 都失效时单独恢复。

### P0.7 必做：规范 agent / 外部写入协议

这次事故暴露的不只是编辑器 UI 问题，还有“谁都可以直接写正文文件”的边界过松。

后续所有 agent 或自动化链路，都应该遵守：

1. 不直接写目标 markdown，先写临时文件。
2. 写完后做最小合法性检查：
   - 非空
   - UTF-8 可读
   - 行数不异常归零
   - checksum 可计算
3. 检查通过后，走原子替换。
4. 替换时把 writer identity、run id、origin path 一并传给 LyraMD。
5. 对 destructive 替换必须显式声明 reason。

如果 agent 只是“中途生成空中间态”，就不应该让 watcher 把它当最终版本吞进去。

### P0.8 必做：在 UI 里明确展示来源与 blast radius

“外部更新”这四个字太弱，不足以支撑用户判断。

至少要展示：

1. 来源：`Codex` / `Claude` / `shell script` / `Finder` / `unknown process`
2. 风险：`删除了 824 行` / `字符数下降 99%` / `非空变空`
3. 动作：`恢复覆盖前正文` / `查看 diff` / `接受外部版本`
4. 时间：绝对时间戳
5. 恢复面：告诉用户“恢复副本已保存在 xxx”

用户看到的必须是：

`外部更新删除了绝大部分正文，我已经替你保留了覆盖前版本。`

而不是一个会消失的小提示。

### P0.9 必做：发布 gate 必须包含 destructive overwrite drill

以后每次涉及以下模块的发版，都要自动跑 drill：

1. watcher
2. autosave
3. revision store
4. crash recovery
5. MCP / agent integration
6. title sync / save as / rename

drill 至少包含：

1. 非空 -> 空
2. 非空 -> 少量内容
3. 大量删行
4. 错过提示后恢复
5. 重启后恢复
6. 多窗口同时打开同一文档时恢复

只要 drill 没过，这类发版就不应该出现在主用安装包里。

### P0.10 必做：事故取证与一键导出

本次恢复严重依赖 Chronicle，是因为产品本身没有给足证据面。

建议后续为文稿安全事件提供一键导出包：

1. 当前文件
2. 最近 revision
3. external-change recovery state
4. event log
5. 变更 diff 摘要
6. app version / build hash

这样一旦再出事故，不需要先人工到处翻 `~/.lyramd`、截图目录、安装包代码。

## 推荐落地顺序

按真实收益排序，建议这样推进：

1. 已完成：revision 落盘 + 超时不清空 + destructive risk + 持久化恢复态
2. 下一步最高优先级：P0.3 集成测试 + P0.8 明确来源/风险文案
3. 第二优先级：P0.4 两阶段提交 + P0.6 last-known-good 镜像
4. 第三优先级：P0.7 agent 写入协议 + P0.9 发布 drill
5. 第四优先级：P0.5 append-only 事件日志 + P0.10 一键导出事故包

## 实施清单

下面把前面的方案进一步压成可执行 checklist，避免后续只停留在原则层。

### 第一层：本地资产保护层

必须做到：

1. `watchFile()` 在任何 destructive external overwrite 真正进入正文前，先稳定落：
   - `external-change` revision
   - `external-change-recovery.json`
   - append-only incident entry
2. `last-known-good` 镜像和当前活跃正文分开存放，不能共生死。
3. destructive snapshot 不参与普通 autosave 的同桶清理。
4. 恢复入口至少存在两条独立链路：
   - UI 面板恢复
   - 直接从磁盘快照恢复

验证标准：

1. 主文件被清空后，`~/.lyramd` 里仍能找到事故前 checksum 对应的正文副本。
2. 删掉 renderer 状态后，依然可以从本地快照恢复。
3. 重启应用后，恢复入口仍存在。

### 第二层：高风险更新隔离层

必须做到：

1. `非空 -> 空`
2. `字符数骤降 >= 阈值`
3. `删除行数 >= 阈值`

以上任一命中后：

1. 外部版本先进入 staged 状态。
2. 当前正文继续作为 active version 保留。
3. UI 明确展示 blast radius、来源、时间、恢复点位置。
4. 只有用户明确确认后，外部版本才真正替换 active version。

验证标准：

1. 外部脚本写空文件时，编辑器正文不会立刻变成空白。
2. 用户即使什么都不点，也不会失去旧正文。
3. 接受外部版本和恢复旧版本都可重复验证 checksum。

### 第三层：来源追踪与取证层

必须做到：

1. 外部写入事件具备 writer identity：
   - `Codex`
   - `Claude`
   - `shell`
   - `Finder`
   - `unknown`
2. 事件日志至少记录：
   - `document id`
   - `file path`
   - `timestamp`
   - `source`
   - `before/after checksum`
   - `before/after char count`
   - `line delta`
   - `risk classification`
3. 文稿安全事件支持一键导出证据包。

验证标准：

1. 发生事故后，不需要人工翻源码才能回答“是谁写坏了正文”。
2. 发生事故后，不需要再依赖 Chronicle 作为唯一证据面。

### 第四层：发布 gate 与运行态 gate

必须做到：

1. 安装包替换后，当前运行实例是否仍为旧版，必须对用户可见。
2. 发版验收要把：
   - `磁盘上的新包`
   - `当前运行中的实例`
   分开验证。
3. 涉及 watcher / revision / recovery / MCP integration 的改动，必须自动跑 destructive overwrite drill。

验证标准：

1. `app.asar` 已替换但进程未重启时，用户会收到明确提示。
2. 发布记录里能同时证明：
   - 新包 hash
   - 运行实例 build id
   - destructive overwrite drill 通过

### 第五层：事故演练层

至少每次大改后跑下面 8 个 drill：

1. `draft` 文稿被外部写空。
2. 普通 `.md` 文件被外部写空。
3. 多窗口同时打开同一文稿后，被外部写空。
4. 外部进程先写空，再写回部分内容。
5. 用户错过即时提示。
6. 用户重启应用后再恢复。
7. 用户在恢复前又收到第二次 destructive update。
8. 用户接受 staged 外部版本后，再撤回到事故前正文。

通过标准：

1. 每个 drill 都能稳定恢复到事故前 checksum。
2. 任一 drill 失败都不得进主用安装包。

## 对这次事故的最终判断

这不是“用户没点到按钮”。

真正的问题是：

1. 系统把高风险 destructive overwrite 当成了普通外部更新。
2. 恢复链只短暂存在于 renderer 内存。
3. 提示消失时，系统没有自动保全用户资产。
4. 事故后缺少独立、稳定、可信的恢复 truth source。

所以后续的目标不应只是“把按钮留久一点”，而应是：

`即使用户什么都没来得及点，也不能丢正文。`

后续应补：

1. `watchFile()` 收到外部清空事件时，会先记录 `external-change` revision。
2. 自动超时后仍能点击恢复。
3. 外部清空后，“最近备份”里可恢复到清空前内容。
4. renderer 重启后，最近一次 destructive external change 仍可被发现。
5. 同一文件连续收到多次外部更新时，不会把最近一次可恢复版本覆盖丢失。
6. draft / 普通 file / pinned file 三类入口都要覆盖，不只测 draft。

如果这 6 条里任何一条还做不到，就不能说这次 P0 已经真正被修住。

### P1 建议：把 rollback session 也落磁盘

仅有 revision 还不够理想。

建议新增：

1. `pending-external-rollback.json` 或等价结构
2. 记录最近一次外部覆盖前内容摘要
3. renderer 重启后仍可恢复

这样即便 renderer 崩了，也不只依赖 revision 列表做人工找回。

设计上建议至少落这几个字段：

1. `documentId / filePath`
2. `capturedAt`
3. `previousContent`
4. `nextContentDigest`
5. `reason = destructive-external-change`
6. `lineDelta / charDelta`

只要这份磁盘态还在，用户就不需要和“3 秒内点按钮”赛跑。

### P1 建议：增加事故遥测与日志

至少记录：

1. 外部更新时间
2. 更新前后字数
3. 是否触发 destructive gate
4. 用户是否执行了 restore / dismiss

这样后续如果还有事故，可以快速判定是 watcher 误判、外部 agent 真写空、还是 revision 没落成功。

建议同时把日志切成两层：

1. 开发态可读日志：方便本机排障。
2. 用户态事故时间线：直接能在 UI 里看到“21:55:58 外部更新将 10363 字变为 0 字，已自动保存恢复点”。

### P1 建议：把 revision 策略从“最好有”升级为“文稿资产保护层”

当前 revision 已经从这次事故里证明不是附属功能，而是安全基础设施。

建议补：

1. destructive external change 永久强制保留，不受普通 revision 清理策略影响。
2. 对最近 `N` 次 destructive snapshots 单独建桶，不和普通手工保存混在一起。
3. revision 列表增加来源标签：
   - `manual-save`
   - `auto-save`
   - `external-change`
   - `crash-recovery`
4. destructive snapshots 支持预览首屏 diff，而不是只显示时间戳。

### P1 建议：把“外部 agent 写文稿”改成事务模型

这次事故暴露的更深层问题是：外部 agent 对用户正文的写入目前太像“直接覆盖文件”。

更稳的模型应是：

1. agent 先提交候选改动。
2. LyraMD 生成 diff 与恢复点。
3. destructive 变更进入确认态。
4. 用户接受后才真正 materialize 到主文件。

即便短期不做完整事务模型，也至少要做一个 lightweight 版本：

1. 外部 agent 写入临时文件。
2. 主进程比较临时文件与当前正文。
3. 达到 destructive 阈值时，优先进入 review / recoverable apply。

### P1 建议：补“空文件恢复”专门入口

当当前文档满足以下条件时：

1. 当前文件为空或接近空；
2. 最近 10 分钟内存在 `external-change` revision；
3. 最近一次 destructive snapshot 的字数远高于当前字数；

UI 应直接出现：

1. `恢复到事故前版本`
2. `查看事故前内容预览`
3. `比较当前空文件与事故前版本`

而不是要求用户先理解 revision、再进入列表里自己找。

### P1 建议：恢复 runbook 标准化

这次恢复动作太依赖临场调查，不应该再重复。

建议沉淀固定 runbook：

1. 锁定事故文件路径与最后修改时间。
2. 复制空文件现场。
3. 导出 `~/.lyramd` 状态。
4. 搜索 revision / rollback session / session storage。
5. 搜索 Chronicle / 屏幕录制 / 系统快照。
6. 生成恢复稿与证据稿两份文件。
7. 输出“可确定恢复 / 部分恢复 / 无法恢复”的分层结论。

## 发布门槛建议

这类问题不应该再以普通修修补补的标准发布。

后续凡是涉及 external write、watcher、revision、draft persistence 的改动，建议默认带以下 gate：

1. 必须有 destructive external change 集成测试。
2. 必须验证 `非空 -> 空` 时存在可见恢复入口。
3. 必须验证最近一次覆盖前正文可在本机稳定取回。
4. 必须做一次人工演练：
   - 打开一个非空 draft；
   - 用脚本把文件写空；
   - 确认 UI 告警；
   - 确认一键恢复；
   - 确认 revision 里也能恢复。

## 面向用户的产品原则

1. 用户正文比一切自动化都更贵。
2. destructive 自动化不能默认静默成功，必须默认可恢复。
3. “可恢复”不能只存在于工程师脑中，必须稳定出现在用户看得到的界面上。
4. 恢复入口必须长寿命、低认知负担、跨重启可用。

## 结论

这次事故的核心不是“没有撤回按钮”，而是：

1. 按钮依赖内存态；
2. 内存态会自动蒸发；
3. 蒸发前没有强制落地备份。

已落地修复已经补上最关键的两层兜底，但要把这类事故真正降到可接受范围，还需要继续做 destructive change gate、自动展开安全面板、rollback session 落盘、以及跨进程集成测试。
