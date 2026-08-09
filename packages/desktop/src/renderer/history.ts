import type { AgentEvent } from '../shared/types';

export const MAX_VISIBLE_AGENT_EVENTS = 500;

export function mergeAgentEvents(
  ...collections: AgentEvent[][]
): AgentEvent[] {
  const byId = new Map<string, AgentEvent>();
  for (const events of collections) {
    for (const event of events) byId.set(event.id, event);
  }
  return [...byId.values()]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-MAX_VISIBLE_AGENT_EVENTS);
}
