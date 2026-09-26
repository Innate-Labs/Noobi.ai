# 免费音频运行组件与混音验证（R44）

日期：2026-09-26。状态：原生及本机 Chromium 工程自验完成；R44 整项和生成成品未验收。

## 实现范围

新 Godot 工程内置 `runtime/noobi/audio_v1.gd` 和接入说明；生成规则要求绑定真实游戏事件。一个跨区域保留的管理器提供 Ogg/MP3 循环、两声部线性音量交叉渐变、最新选曲排队、相同曲目保留播放位置、显式重开与停止清理。音效为最多八声部的一次播放，忙时轮流替换，不无限增加播放器。资源先复制再修改循环属性，原素材保持不变。

菜单暂停时，音乐与游戏音效冻结，菜单反馈仍可播放；方案也可明确选择菜单继续音乐。复用 UI 已有的 Master / NoobiMusic / NoobiSFX 总线与持久化设置，保留现有增益、静音和路由。没有重新开发音量设置，没有付费调用，也没有修改旧游戏或 A/B 工程。

这里只提供非空间背景音与事件音效。环境空间声仍需具体场景中的 AudioStreamPlayer3D、距离和生命周期设计。组件随新工程提供，实际生成作品是否正确采用仍须独立检查。

## 可复现证据

命令：`npm run build:main` 后运行 `node scripts/game-audio-smoke.mjs`，需要本机 Godot 和 FFmpeg。脚本先核验库内素材 SHA，再创建明确标记的独立工程，不启动模型或制作任务。

最终证据目录：`.noobi-private/stage-07/audio/2026-09-26T00-22-55.543Z/`。`report.json`、`engine-report.json`、`sources.json`、事件帧号与 `mix.wav` / `mix.avi` 同存。索引为 `.noobi-private/stage-07/audio-latest.json`。首次 18 项通过记录保留于 `2026-09-26T00-18-46.010Z/`；补充边界后最终 26 项通过。

- 真实 Godot Movie Maker 输出 65 秒引擎混音，非麦克风录音、非用户实时游玩。使用库内 CC0 `exploration.ogg`、`happy-adventure.mp3` 和 `pickup.ogg`，保留来源与哈希。440Hz 工程校准音只用于测量分轨增益，不冒充音乐库内容。
- Ogg 从头完整播放约 42.667 秒后实际回到起点；MP3 跳转到尾部后实际经过循环边界，未将它记为整首播放验证。
- 检查同曲重复请求、快速切换/取消/最后排队曲目实际开始、两声部上限、冻结渐变、菜单继续音乐选项、显式重开归零、八音效上限、停止取消队列、重复管理器清理、非法输入及 Ogg/MP3/WAV 原始属性不变。
- 最终 PCM 的音乐、恢复、渐变与菜单音效采样窗有非零信号；暂停、停止、音效静音、Master 静音和最终静音窗口均为零。
- 音效总线 -12dB 前后同一校准音实际 RMS 比值为 `0.2511912919`，与目标线性增益相符。断言运行状态之外也检查实际最终混音。

Godot 对循环和 Movie Maker 的行为依据：[AudioStreamOggVorbis](https://docs.godotengine.org/en/stable/classes/class_audiostreamoggvorbis.html)、[Movie Maker](https://docs.godotengine.org/en/stable/tutorials/animation/creating_movies.html)。

- 全仓 `npm run verify`：85 个文件、693 项测试通过，类型检查与构建退出 0。日志 `.noobi-private/stage-07/audio-verify.log`。既有构建大块提示仍保留。
- 调用正式 `createWorkspaceTemplate` 创建独立工程，确认所写音频组件与上述实际测试文件逐字一致；绑定见 `template-binding.json`，运行时 SHA-256 为 `080b499c9ed14bb68ab66dcbb2b0fe1bb1ec771df0e79ace22610d2db70d268c`。

## 验收边界与下一步

引擎混音证明音频信号、分轨和停止策略生效，不能证明扬声器出声、真人听感、音乐接缝自然或成品音画同步。开启 loop 不会把任意歌曲变成无缝配乐；两个音轨均需试听接缝及游戏内选曲质量。多个音效可能叠加削波，具体作品还需混音限幅/响度检查。

R44 剩余：浏览器真实手势解锁及输出证据、成品切区/暂停/重开与 UI 的实际接入、音画同步、完整循环试听。既有 UI 跨会话设置证据见 [阶段 12](12-delivery.md)，本轮未重复整套 UI 测试。自主 A/B 仍停止且未验收，不用工程音频结果改变它们的失败结论。多作品基准仍为 0/30。


## 浏览器真实输入与无声故障修复

后续发现原生通过的旧组件在 Godot 4.7.1 单线程 Web 导出中无声：实际点击开始后 AudioContext 已 running，游戏为 playing，但终端输出采样全零。旧构建 `9555f7d0-35b5-44a7-b928-bf9e9d123c4e` 的失败证据保留在 `.noobi-private/stage-07/browser-audio/2026-09-26T00-30-24.922Z/browser-1790382906516/`；同构建更早的 `browser-1790382844671/` 也保留失败。以实际存在的 `results.json` 为准。

检查本机导出器 JS 发现 Sample 模式的追加总线分支会把默认 -1 传入移动逻辑，Master 到 destination 的连接随后被移除；与 [Godot 上游报告 #119026](https://github.com/godotengine/godot/issues/119026) 的机制一致。显式传 bus_count 的尝试仍无声，记录在 `2026-09-26T00-36-10.498Z/`，该改动已撤回。最终组件的播放器明确使用 `AudioServer.PLAYBACK_TYPE_STREAM`，经引擎混音后输出，避免依赖这条 Sample 总线路由。没有改引擎文件、用户游戏或全局浏览器自动播放权限。

[Godot 官方 Web 音频说明](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html#audio-playback) 支持为播放器选择 Stream；代价是单线程 Web 延迟可能较高。当前未测端到端延迟，不能宣布节奏/战斗音画同步已达标。

### 最终验证

- 脚本：`electron scripts/game-audio-browser-build.mjs` 使用正式工程模板与构建服务创建隔离夹具；`electron scripts/game-audio-browser-smoke.mjs` 执行实际键鼠检查。夹具是盒体/胶囊组成的组件场景，F7 是专用菜单音效测试键，不是自主生成成品。
- 本机 Electron 43.3 / Chromium 150，干净临时 profile，强制 `document-user-activation-required`。不调用探针 resume、不以 JavaScript 更改游戏状态或总线值。输入由浏览器真实事件进入 Godot；音量操作为实际点击滑块及 Home/End 按键。
- 13 步全部通过：手势前 context suspended 且零输出；点击开始后 running 且有信号；实际拾取触发换曲；暂停零输出；菜单音效有声；音效静音/恢复；音乐静音而音效仍输出；总音量静音/恢复；返回标题停止；重开恢复输出且拾取归零。
- 通过旁接 Web Audio Analyser 采样最终连接到 destination 的节点，保留每个采样块、context 状态、真实游戏状态和截图；跟踪连接/断开，避免把旧节点算成仍在输出。未向原音频链写入音量或信号。采样不是连续录音，不证明扬声器、感知延迟或真人试听。
- 最终目录 `.noobi-private/stage-07/browser-audio/2026-09-26T00-36-42.648Z/browser-1790383009462/`；`results.json` passed、errors 为空。已查看设置页及重开后的实际 HUD 截图。开始输出 peak `0.07119751`，换曲 `0.33569336`；暂停、分轨静音、总静音与标题窗口均 `0`。
- 构建 `64bded28-f4d5-4446-967f-526d7fd7727c`，source `5fd4dc276cc75ed8b5ab939960550da3e323617aef5c8640897fdb2b600ff275`，artifact `7252017a654a465d12576d4905350f011a6078e6148230c2e09541aedaf39d18`。正式冻结构建在前后均校验完整。音频 runtime SHA `7bb5d49672a7465263f2d5b712544ebd79397d7ea3538355edb0dff969341229`。
- 因播放器模式改变，针对性重跑原生混音 26 项，全部通过：`.noobi-private/stage-07/audio/2026-09-26T00-37-25.980Z/report.json`。全仓 85 文件 / 693 项测试、类型检查及构建通过：`audio-stream-verify.log`。

测试脚本最初在空窗口 Page.enable 处停住，先加载 about:blank 后消除，已加 90 秒超时留证；后续采样也修正了动态断开节点的跟踪。它们是测试工具问题，未记为游戏故障。真正的旧 Sample 模式无声已由修正后的探针复现，未删除失败构建。

本轮补齐本机 Chromium 工程的真实手势与 UI 音频联动。Safari/Firefox、其他设备、成品完整流程、跨区选曲、循环接缝与音画同步仍待验收；R44 不整体勾选，0/30 基准不变。
