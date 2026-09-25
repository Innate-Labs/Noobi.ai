# 阶段 09 开发记录

2026-09-26：开发中，不是整阶段通过。

## 已实现

新增 `scripts/game-long-run.mjs` 和 `quality/longRun.ts`。策略在启动前冻结，持续时间 10 秒至 4 小时；真实键盘输入循环，不调用游戏函数。固定 Web 构建、分辨率、图形档位声明及性能阈值，开始与结束校验源和产物 hash。每 5 秒保存运行状态、引擎帧计数、浏览器可见性、渲染进程工作集；每分钟截图。运行错误、帧计数停止和暂停会中止并保留报告。

浏览器 requestAnimationFrame 间隔与引擎 process frame 速率分开记录，不能当作 GPU 耗时。性能报告保存中位数、p95、p99、长帧比例、内存序列和启动信息。它不自动判断画面相似、需求完成或趣味；这三项显式标成未评估。

## 当前证据

- `npm run verify`：81 文件、652 测试，退出 0（字体和长测策略版本）；后续增量另记录。
- 真 Electron / Godot 工程夹具：`.noobi-private/stage-09/long-run/2026-09-25T20-40-14.024Z/report.json`。运行 15.77 秒，1341 个浏览器帧间隔样本，无运行错误；此初次工具验证尚未包含后来新增的引擎 FPS 门槛。**不是 30 分钟验证，不是自主生成完整游戏**。
- 构建 `44bb6b56-a4c7-4548-8860-08247183d040`；源 `83b02ea01c78912c284c1221db8760dc57c1d8a9a83b8b93f7a250aa60dac637`；产物 `6c558877a79b05fa09a26c6986082a3e8dd0533163e0184377c259d13027a2c3`。

## 使用

先 `npm run build:main`，再用 Electron 运行 `scripts/game-long-run.mjs --store <私有构建仓库绝对路径> --project <项目ID> --build <固定构建ID> --policy <JSON>`。策略字段见 `LongRunPolicy`；30 分钟须 durationSeconds >= 1800。输入步骤只有 key/holdMs 或 waitMs，不能注入脚本。报告在 `.noobi-private/stage-09/long-run/`。

## 未完成

当前构建 30 分钟实际路线、完整流程和冻结设备正常档位实测；参考相近镜头的多维对照入口；故障样例准确性矩阵；至少 3 位真人试玩。全部保留为未验收，不能以工具和短测代替。
