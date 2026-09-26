# 免费音频运行组件与混音验证（R44）

日期：2026-09-26。状态：平台原生工程自验完成；R44 整项和生成成品未验收。

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
