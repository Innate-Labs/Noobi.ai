# 浮岛机关与桥梁样板

两张参考图由本次 ImageGen 生成；源码依据实际图片中的结构编写。`gear-machine.mjs` 有两个命名齿轮轴，各三个轮辐；`bridge.mjs` 有七段木桥面、每侧八个护栏柱和两条横杆。桥面使用程序化木纹，静态金属零件按材质合并，导出后为九个网格。风向机关沿用上一层的 `wind-beacon.mjs`。

每个模型配 `.spec.json`，通过 Noobi 的 `noobi_model3d_generate` 提交已注册的 `referenceImage` 及复制到工程 `model-sources/` 的 `sourcePath`。Three.js 和 BufferGeometryUtils 由宿主提供；不要在 Node.js 中直接运行这两个浏览器 factory。宿主输出真实 GLB 和绑定证据。生成文件名由宿主分配，不能写死本机产物 UUID 用于新工程。

`island-integration.patch` 保存这次《浮岛修复师》的实际接入差异，供复核；它依赖该游戏原版本和本次本机资产路径，**不是任意工程的一键安装脚本**。关键点是：

- 新资产保留 GLB 材质，不再用旧 palette 覆盖。
- 风车的 RotorPivot 和齿轮的 GearLeftPivot / GearRightPivot 驱动真实部件。
- 桥梁覆盖 14 米完整通路，桥面顶面 y=0，碰撞体独立匹配；整桥随修复动画一起升起。

`verify-island-integration.gd` 是针对这个游戏的专项测试。必须在游戏副本中执行，并将 project.godot 的 config/use_custom_user_dir 设为 true、config/custom_user_dir_name 设为专用测试目录，然后 headless import，再运行该脚本。测试会设置能源和玩家位置，再发送 E/Q 检查部件转动、桥梁、碰撞和暂停；不得把它描述为真实完整通关。真实浏览器玩家路线另有本地截图及日志。

模型是适配低多边形游戏的近似重建；背部和底部为推断，精细磨损、石纹与参考图的纹理并未逐像素复刻。
