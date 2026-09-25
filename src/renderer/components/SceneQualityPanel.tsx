import type { SceneQualitySummary } from '../../shared/sceneQuality';
export function SceneQualityPanel({ report }: { report: SceneQualitySummary }) {
  return <section className="experience-scene-quality" aria-label="3D 场景专项检查">
    <strong>3D 场景检查 · {report.status === 'pass' ? '自动核对通过' : '需要补齐'}</strong>
    <p>范围：{report.scope}。运行中发现 {report.observedGeometry} 个几何对象，已登记 {report.coveredGeometry} 个，其中程序生成 {report.proceduralGeometry} 个。</p>
    <p>已登记不代表外观合格；遮挡、穿模、风格和画面质量须结合实际截图独立审查及用户验收。</p>
    {report.findings.length > 0 && <details open><summary>证据缺口与修复项（{report.findings.length}）</summary><ul>{report.findings.map((f,i) => <li key={i}>{f}</li>)}</ul></details>}
    <details><summary>画面审查重点（{report.reviewRequired.length}）</summary><ul>{report.reviewRequired.map((f,i) => <li key={i}>{f}</li>)}</ul></details>
    <small>构建：{report.buildId} · 本记录不替代完整游戏验收</small>
  </section>;
}
