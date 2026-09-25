# 图片参考建模样板

`wind-beacon.png` 是本次通过 ImageGen 生成的孤立道具参考图；`wind-beacon.spec.json` 记录观察到的部件和推断面；`wind-beacon.mjs` 是 AI 看图后编写的 Three.js factory，不调用固定模板或图片转 3D 模型。

执行 `npm run smoke:model3d`。需要项目依赖、Electron、可发现的 Godot 4；首次导入和无限循环拒绝测试需要约半分钟以上。输出位于 `.noobi-private/image-threejs-smoke/result.json`，其中 evidencePath 指向宿主独立加载 GLB 后生成的正、侧、背面 PNG。可编辑 `.mjs` 和规格后再次运行；旧候选保留。

编写新资产的最小约定：

```js
export async function createModel(THREE, { referenceUrl }) {
  const root = new THREE.Group();
  // 在这里根据图片实际结构编写命名部件、材质、连接点与动画。
  return { root, animations: [] };
}
```

规格包含 `referenceImage`、非空 `parts`、非空 `criticalFeatures`、`inferredSurfaces`。图片必须先通过宿主注册；工具输入均为工程相对路径。参考图可通过 referenceUrl 加载为纹理，不允许从外部网络或本机其他文件加载内容。需要骨骼动画时必须真实创建 skin/clip，不能仅设置 animation=true。

样板为近似静态道具：四个拓宽叶片、黄铜轮毂、琥珀中心、青色立柱和阶梯底座已建模；精细石纹、磨损、完全一致的高光仍未完成。后部轴承由单图推断。技术检查不代表外观或完整游戏验收通过。

本机 img2threejs 技能用于流程参考；其 `validate_sculpt_spec.py` 当前有语法错误，未作为可发布依赖，未宣称通过该技能全套精细雕刻验收。Noobi 使用仓库内可测试的宿主校验与独立 Reviewer 流程。
