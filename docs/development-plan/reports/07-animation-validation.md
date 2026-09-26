# 动画有效性：从轨道数值到实际网格变形

日期：2026-09-26。状态：平台检查补强与工程自验完成；R15 / 07-D04 及自主游戏动画未完成。

## 修复的问题

原检查只看绑定属性是否变化，存在三类误判：移动空节点可冒充模型动作；无权重的骨骼可冒充蒙皮动画；四元数正负号变化可被当作旋转。原来的四分点采样还会漏掉短促动作和仅在末帧变化的动作。

宿主现于独立 GLB 重载后采样可绘制网格的世界坐标顶点，记录最大位移；骨骼模式还要观察固定原始顶点经过实际骨骼权重变换后的局部变化。整体平移带 skin 的模型不能被算作骨骼变形，每个 required 骨骼片段分别检查。`animation=true` 也不能只凭 skin 和片段名称通过。

采样包括最多 9 个均匀时间及 8 个关键帧时间，使用一次播放并保留末帧；最多 8192 个顶点样本，阈值为 `max(0.00001m, 静止包围盒对角线 × 0.00001)`。证据保留轨道变化、顶点变化、蒙皮变化、位移、阈值与采样时间，便于区分原因。复用键中的 renderer 版本升为 3，后续相同输入不会复用旧算法的生成缓存；原资产和历史证据未改写。

## 实测

- `scripts/model-animation-smoke.mjs`：8 组真实 Three.js 导出→无作者代码 GLB 重载→宿主验收。普通刚体位移、0.04 秒短促动作、末帧动作、真实加权骨骼动作通过对应模式；空节点、等价四元数、无权重骨骼不算模型运动；蒙皮整体平移可算刚体运动但不能算骨骼变形。
- 额外对真实加权/无权重两份 GLB 调用 `animation=true` 正式渲染入口，分别接受/拒绝。最终目录 `.noobi-private/stage-07/animation/2026-09-26T00-50-53.662Z/`，`report.json` passed；每例源码、GLB、静态透视图和采样指标保留。索引 `animation-latest.json`。图片为明确的工程方块，不是角色美术。
- `scripts/model-animation-godot-smoke.mjs`：3 份同字节 GLB 导入 Godot 4.7.1，实际播放后获取骨骼姿态烘焙的顶点。加权骨骼的 24 顶点最大位移约 `0.2625m`；无权重骨骼与刚体平移蒙皮的局部蒙皮位移为 `0`。证据 `.noobi-private/stage-07/animation/2026-09-26T00-47-36.108Z/godot/`，已查看 start/pose 实际渲染图。最终 GLB 与 Godot 所测 GLB 的哈希对应保存在 `godot-binding.json`。
- **保留的跨引擎缺口**：刚体平移蒙皮在 Three.js 世界位移约 `0.2m`，该 Godot 夹具世界位移采样为 `0`。因此这份资产的动作传递没有通过，不能把该组三份的蒙皮分类检查称为三种动作都成功导入。需继续定位导入路径、动画目标及采样时序；本轮不自动重写用户模型。
- 正式资产服务回归 `scripts/model-contract-smoke.mjs` 通过，验证成功资产复用、错尺寸/静止片段/假骨骼拒绝、失败不额外导入模型，以及 Godot 动作/挂点。证据 `.noobi-private/stage-07/models/2026-09-26T00-50-57.979Z/`，日志 `animation-contract-regression.log`。
- 单元测试增加“每个 required 骨骼片段都必须有变形”案例。全仓 `npm run verify`：85 文件 / 694 项测试、类型检查与构建通过，日志 `.noobi-private/stage-07/animation-verify.log`。

Godot 姿态烘焙方法见 [MeshInstance3D 官方文档](https://docs.godotengine.org/en/4.4/classes/class_meshinstance3d.html#class-meshinstance3d-method-bake-mesh-from-current-skeleton-pose)。测试会读取实际骨骼姿态后的网格，未用手写预期位移冒充测量。

## 剩余标准

采样仍可能漏掉局部或极短动作；网格变化不证明屏幕上可见、步态自然、脚底接地、无穿插或命中同步。仅顶点骨骼采样不能完成状态过渡、骨架复用、游戏输入到动作的绑定。角色/敌人/武器在同一自主成品的完整路线、碰撞、挂点及参考风格验收仍保留，07-D04 / R15 不整体勾选。A/B 与章鱼云岛未恢复、未修改，多作品基准仍 0/30。


## 后续定位：Godot 丢弃直接蒙皮节点轨道

2026-09-26 后续检查已经定位前述零位移原因。独立诊断导出了 Godot 导入后的场景和动画：旧 `rigid-skin-translation` 的 action 片段为 **0 条轨道**；加权骨骼片段保留 `ActorRoot/Body/Skeleton3D:Tip`。将 AnimationPlayer 切到手动推进并直接 seek 后，结果仍一致，不是原先渲染采样没赶上。

诊断记录为 `.noobi-private/stage-07/animation-diagnosis.log`，导入后的 `.tscn` 位于 `animation/2026-09-26T00-50-53.662Z/godot-diagnosis/`。同时看到导入后的峰值关键帧被重采样/优化：Tip 的 0.5 秒 / 0.3m 变为约 0.5333 秒 / 0.28m，所以 0.5 秒实测只有 0.2625m。位移消失与峰值变化分开记录。

### 平台处理

- 新增 `modelAnimationPortability.ts`。无作者代码的重载阶段检查 GLB 实际 channel 目标；直接指向带 skin 节点的 translation / rotation / scale 拒绝，返回 `GODOT_SKIN_TRACK` 及片段、节点和修正建议。不修改引擎、导出文件或旧用户模型，不静默将骨骼模式降级。
- 整体移动应控制包含网格和骨架的普通父节点；局部姿态应控制有权重的骨骼。将规则写入 `MODEL_ASSETS_V2.md`，并提示实际游戏中世界移动通常由角色控制器负责。
- 普通父节点/骨骼节点的变换、morph weights 不被这项结构检查拒绝，仍须经过其他运动/蒙皮验收。该规则只覆盖已经复现的风险，不等同于所有 Godot 导入问题已解决。
- 缓存 renderer 版本升为 4，后续生成不会复用没有这项结构检查的旧缓存。历史失败与旧资产保留。

### 新证据

- `scripts/model-animation-smoke.mjs` 现在包含 9 组：旧直接蒙皮节点平移被真实渲染入口拒绝，新增父节点平移通过，其余正反例继续通过。目录 `.noobi-private/stage-07/animation/2026-09-26T01-01-36.109Z/`，`report.json` passed。
- `scripts/model-animation-godot-smoke.mjs` 为每轮建立独立目录，记录导入轨道路径，检查轨道不为空并使用手动推进。三个工程模型实测：加权骨骼局部与世界位移 `0.26249999m`；无权重骨骼均 `0`；普通父节点平移的局部蒙皮位移 `0`、世界位移 `0.17499995m`，轨道为 `ActorRoot`。后者证明整体移动实际传入 Godot，未将其误判为骨骼变形。
- Godot 证据目录 `animation/2026-09-26T01-01-36.109Z/godot-2026-09-26T01-01-40.631Z/`，`results.json` passed；已看父节点平移的 start/pose 实际截图。
- `npm run verify`：86 文件 / 699 项测试、类型检查和构建通过；新增五项结构检查测试。日志 `.noobi-private/stage-07/animation-portability-verify.log`。本轮渲染日志出现一次 macOS `TASK_SUPPRESSION_POLICY` 提示，但案例均结束且退出 0，未将系统提示隐去或当作模型故障。

此前的跨引擎丢轨道风险已有前置拦截与可行父节点方案，旧不合格资产本身未修复。导入峰值精度、游戏内动作状态过渡、接地/穿插、碰撞和真人体验依然需要后续验收，R15 / 07-D04 不整体勾选。
