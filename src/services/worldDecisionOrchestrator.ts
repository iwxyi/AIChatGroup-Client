export interface WorldDecisionCandidate<TMeta = Record<string, unknown>> {
  id: string;
  kind: string;
  reasonType?: string;
  localScore: number;
  summary?: string;
  meta?: TMeta;
}

export interface WorldDecisionTraceV2 {
  eventType: 'world_decision_v2';
  domain: 'proactive_care' | 'open_chat' | 'calendar_patch_queue';
  selectedId: string;
  selectedKind: string;
  selectedReasonType?: string;
  decisionSource: 'local' | 'model';
  modelReason?: string;
  confidenceDelta?: number;
  candidateCount: number;
}

export async function orchestrateWorldDecision(params: {
  domain: WorldDecisionTraceV2['domain'];
  candidates: WorldDecisionCandidate[];
}) {
  const sorted = [...params.candidates].sort((a, b) => b.localScore - a.localScore);
  const local = sorted[0] || null;
  if (!local) return null;
  return {
    selected: local,
    confidenceDelta: 0,
    trace: {
      eventType: 'world_decision_v2' as const,
      domain: params.domain,
      selectedId: local.id,
      selectedKind: local.kind,
      selectedReasonType: local.reasonType,
      decisionSource: 'local' as const,
      candidateCount: sorted.length,
    },
  };
}
