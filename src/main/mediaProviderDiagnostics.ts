export function configuredMediaProviderDiagnostic(displayName: string): string {
  return `${displayName} 本地配置完整（未调用 API）；实际生成将在 Agent 回合中按额度调用。`;
}
