# 阶段 10 开发记录

2026-09-26：开发中。当前实现固定版本 Web 试玩包；未宣布原生桌面或干净设备验收通过。

## 实现

版本历史新增“导出 Web 试玩包”。导出先后校验同一存档或构建的文件 hash，只复制已导出的网页产物和许可文本，附带独立 manifest、目标平台、版本状态和启动说明。通过检查的版本、失败版本和历史构建保留各自状态；导出不把未验收构建升级为成品，也不触发生成或公开发布。

导出使用用户选择的目录，在临时目录完成后原子提交，失败清理临时副本。拒绝链接、隐藏开发文件、未支持类型、常见凭据模式与本机绝对路径。扫描不是对加密/编码内容的全面凭据审计。引擎自带 PEM 解析标头和 Emscripten 的 `/home/web_user/.config` 等虚拟路径不是开发凭据；真实 PEM 内容和开发路径仍拒绝。

包需要 HTTP/HTTPS 静态服务，不能双击 file://；游玩无需 Noobi/模型账户/Godot 编辑器。**它尚不是自带服务器的桌面启动包**，这项限制在 UI 反馈和包内说明中写明。存档沿用游戏和浏览器同源规则，不承诺换域名自动迁移。

## 真实验证

- `scripts/game-web-export-smoke.mjs`：从固定 Godot 构建导出，独立浏览器 profile 仅加载复制的 game 目录，主场景运行、按键输入后帧推进、无 Noobi preload，通过。
- `.noobi-private/stage-10/export/2026-09-25T20-50-47.523Z/result.json`；截图 `01-export-loaded.png`、`02-export-started.png`。这是工程夹具，不是自主生成完整游戏。
- 构建 `a3f08847-42b0-4e80-9d7c-69508c04a789`；精确 SHA 在导出 manifest 与字体检查构建记录中。
- 初次导出检测到引擎内置解析标头/虚拟文件系统，保留失败日志 `export-check.log`；收窄到真实敏感内容后重测通过 `export-check-2.log`。
- 单元测试覆盖常见凭据、二进制字符串、机器路径、符号链接、导出期间快照变化、禁止复制开发账户文件。
- `npm run verify`：82 文件、656 测试，退出 0。`npm run smoke:ui` 退出 0，已查看真实工作台截图。后续小幅扫描范围更新另跑针对测试。

## 启动前校验修复

真实样板 B 暴露“文件夹不存在却先保留启动记录”的问题。PlanStarter 现在先校验文件夹和附件，再保留执行记录。对历史未绑定项目的失败方案新增复制原方案入口，保留原分析和失败记录，复用方案时不伪造新模型调用。已绑定项目不能用此入口重复创建。

## 尚未完成

原生桌面独立启动包、干净 macOS 用户/设备验收、Windows 设备、浏览器全屏和原生鼠标锁定、完整成品的更新存档兼容性与真实用户验收。已有右键拖拽不得冒充鼠标锁定通过。完整阶段仍未验收。

### 导出按钮实测补充

在隔离 Noobi 窗口实际展开版本历史并点击导出，前端 → preload → IPC → 导出服务路径已执行。测试中只有系统目录选择器用固定私有目录替身，未声称人工选择系统对话框。首次发现扫描正则把引擎 JavaScript 中两个不同字符串拼成机器路径，修正字符串边界并增加回归测试；真实按钮最终重测通过，导出 11 文件，结果位于 `.noobi-private/stage-10/ui/exports/Noobi-Web-legacy-5a348-14f92bb3`；截图 `03-export-confirmed.png` 已实际检查。


### 原生 macOS 工程包（2026-09-26）

新增 `scripts/game-native-export-smoke.mjs`，从阶段 12 的固定工程构建导出独立 `.app`。在独立副本中配置 macOS 导出、Apple Silicon 所需 ETC2/ASTC 纹理导入与本地 ad-hoc 签名；原源码/产物前后 hash 保持一致。原生包为独立导出变体，manifest 另记原生 PCK、运行程序和导出配置 hash，不能沿用 Web 完整试玩结论。

- 首次因缺少 ETC2/ASTC 导入设置而失败，日志 `.noobi-private/stage-10/native-check.log`；修复的是导出副本，没有改原游戏。
- 最终命令 `node scripts/game-native-export-smoke.mjs` 退出 0，记录 `native-final.log`；产物目录 `native/2026-09-25T21-45-26.122Z/delivery`，索引 `native-latest.json`。
- 用包内运行程序在空目录启动，无 Noobi/编辑器参数/模型凭据；原生宿主日志确认主菜单状态及真实中文按钮，120 帧无引擎错误。
- `codesign --verify --deep --strict` 通过，原生 PCK 常见凭据/机器路径扫描通过；引擎及第三方许可由同版本引擎 API 导出，字体许可随包保存。
- 原生窗口录制 5 帧并提取 `native-title.png`，实际查看中文菜单、焦点和键位说明。Movie Maker 帧不代表性能测量，也不代表真实输入通关。

依据 [Godot macOS 导出说明](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_macos.html) 使用本地 ad-hoc 签名；未公证、未修改 Gatekeeper，也未在干净系统/其他电脑验证。许可来源处理参考 [Godot 授权说明](https://docs.godotengine.org/en/stable/about/complying_with_licenses.html)。这是工程导出脚本和实物包，**尚未接入 Noobi 的一键桌面导出按钮**；原生交互/保存继续、正式成品与干净设备仍待验收。


原生输入补充：新增只读探针显式参数 `-- --noobi-native-probe`，仅显式开启时持续输出状态；普通原生启动仍只输出前两帧摘要。没有修改玩家状态或游戏规则。为此重新构建工程夹具，未沿用旧包冒充新探针验证。

最新原生导出位于 `native/2026-09-25T21-51-20.388Z`。`scripts/game-native-ui-smoke.mjs` 使用现有已授予的 macOS 辅助功能权限，按进程 ID 发送真实键盘事件，不弹权限请求、不操作其他程序：

- `native-input-1790373092699/result.json`，退出 0：14 步完成开始、移动/拾取、背包、任务、地图、暂停保存、设置、掉落失败、重试、终点、返回标题及继续。
- `node scripts/game-native-ui-smoke.mjs --continue-only`，`native-input-1790373163869/result.json`，退出 0：重新启动独立游戏进程后，通过标题继续读回拾取进度。
- 早先输入测试没有收到状态包而失败，记录保留；原生探针只打印两份状态、且需要确保窗口获得焦点。修订采集与输入后用新构建验证，失败不计成功。
- 该脚本只针对工程游戏使用的键位/状态，不是任意作品的通用通关器；现有辅助功能未授权时退出失败，不自动请求权限。

这些结果补上本机原生键盘流程和进程重启恢复，不代表全新 OS 用户、其他设备、原生鼠标完整操作或 Noobi 的桌面导出入口已经完成。宿主全仓回归另见 `native-full-verify.log`。


## Noobi 正式 macOS 导出入口（2026-09-26）

Godot 作品的「版本历史与恢复」现有「导出 macOS 游戏包」按钮，可导出冻结的历史构建或可玩版本存档。前端经 preload/IPC 调用 `gameMacExport.ts`，不需要用户在终端运行工程脚本。系统选择保存目录后生成 `Game.app`、版本/原生文件 hash 清单、引擎与已发现许可说明；使用本地签名，不公证、不自动启动或发布游戏。

导出复制到临时工作区，为 macOS 纹理导入设置单独配置，保持原输入不变；开始/结束均重新验证冻结输入。历史构建要求当前引擎与原构建版本匹配，完整存档记录本次使用的引擎与源码清单摘要。原生是另一个导出变体，包内始终注明原生玩法/干净设备未自动验收。每个项目只允许一个同时进行的原生导出，临时内容在失败时清理，不覆盖已有包。

- `node scripts/game-mac-service-smoke.mjs` 退出 0，真实服务导出 13 个文件；导出末尾注入冻结源校验失败，确认没有发布部分包且已有包保持不变。证据 `.noobi-private/stage-10/mac-service/2026-09-25T22-03-23.412Z/result.json`。
- 在隔离 Noobi 项目中实际点击新按钮，输出 `.noobi-private/stage-10/ui/exports/Noobi-macOS-legacy-5a348-98917653`，截图 `05-mac-version-entry.png`、`06-mac-export-result.png` 已查看。只有系统目录选择器使用固定私有目标目录替身，其余为实际界面和宿主导出链路。
- `npm run verify` 84 文件 / 667 测试通过，退出 0；`npm run smoke:ui` 退出 0，已查看界面。日志 `mac-final-verify.log`、`mac-ui-smoke.log`。

此入口补齐 10-D02 的 macOS/Web 独立包生成，其他平台、干净设备、自动存档迁移和正式成品验收仍保留待办。


版本分支补充验证：隔离工程通过 GameVersionStore 建立未验收的可玩备份（明确为测试记录，未伪造 passed），再调用正式 `exportGameVersionMac`，得到 `Noobi-macOS-1b3a5c44-b47-88d7a620`，13 文件。确认历史构建与完整存档两条后端路径均可导出；此调用复用了测试目录选择器。第一份真实按钮包还通过空工作目录下的包内原生程序启动检查，主菜单状态正常，日志 `ui/mac-button-native-load.log`。这些检查不改变包内原生玩法待验收标记。
