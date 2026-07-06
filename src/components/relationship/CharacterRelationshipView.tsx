import { useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';

export interface CharacterRelationshipViewNode {
  id: string;
  name: string;
  graphName?: string;
  role?: string;
  summary?: string;
}

export interface CharacterRelationshipViewEdge {
  id: string;
  fromId: string;
  toId: string;
  note: string;
  tone?: 'warm' | 'tense' | 'mixed' | 'neutral';
  strength?: number;
  inferredFrom?: string;
}

export interface CharacterRelationshipViewCircle {
  id: string;
  name: string;
  summary?: string;
  nodeIds: string[];
  keyEdgeIds: string[];
  bridgeEdgeIds: string[];
}

interface CharacterRelationshipViewProps {
  nodes: CharacterRelationshipViewNode[];
  edges: CharacterRelationshipViewEdge[];
  circles?: CharacterRelationshipViewCircle[];
  emptyTitle: string;
  emptyDescription: string;
}

const toneLabels: Record<NonNullable<CharacterRelationshipViewEdge['tone']>, string> = {
  warm: '亲近',
  tense: '紧张',
  mixed: '复杂',
  neutral: '中性',
};

function getToneColor(tone: CharacterRelationshipViewEdge['tone']) {
  switch (tone) {
    case 'warm':
      return 'success.main';
    case 'tense':
      return 'error.main';
    case 'mixed':
      return 'warning.main';
    default:
      return 'text.secondary';
  }
}

function getToneStroke(tone: CharacterRelationshipViewEdge['tone']) {
  switch (tone) {
    case 'warm':
      return '#2e7d32';
    case 'tense':
      return '#d32f2f';
    case 'mixed':
      return '#ed6c02';
    default:
      return '#78909c';
  }
}

function getNodePositions(count: number) {
  const centerX = 120;
  const centerY = 74;
  if (count <= 1) return [{ x: centerX, y: centerY }];
  return Array.from({ length: count }).map((_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return {
      x: centerX + Math.cos(angle) * 76,
      y: centerY + Math.sin(angle) * 42,
    };
  });
}

function getOverviewNodePositions(count: number) {
  const centerX = 180;
  const centerY = 130;
  if (count <= 1) return [{ x: centerX, y: centerY }];
  return Array.from({ length: count }).map((_, index) => {
    const ring = count > 10 && index % 3 === 0 ? 62 : 96;
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return {
      x: centerX + Math.cos(angle) * ring,
      y: centerY + Math.sin(angle) * Math.min(82, ring),
    };
  });
}

function buildCircleNameFallback(index: number) {
  return `关系圈 ${index + 1}`;
}

function getRelatedEdges(nodeId: string, edges: CharacterRelationshipViewEdge[]) {
  return edges.filter((edge) => edge.fromId === nodeId || edge.toId === nodeId);
}

function RelationshipInspector({
  selectedNode,
  selectedEdge,
  nodes,
  edges,
}: {
  selectedNode?: CharacterRelationshipViewNode | null;
  selectedEdge?: CharacterRelationshipViewEdge | null;
  nodes: Map<string, CharacterRelationshipViewNode>;
  edges: CharacterRelationshipViewEdge[];
}) {
  if (selectedEdge) {
    const from = nodes.get(selectedEdge.fromId);
    const to = nodes.get(selectedEdge.toId);
    const tone = selectedEdge.tone || 'neutral';
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          {from?.name || selectedEdge.fromId} {'->'} {to?.name || selectedEdge.toId}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
          <Chip size="small" variant="outlined" label={toneLabels[tone]} sx={{ color: getToneColor(tone), borderColor: getToneColor(tone) }} />
          {typeof selectedEdge.strength === 'number' ? <Chip size="small" variant="outlined" label={`强度 ${selectedEdge.strength}`} /> : null}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {selectedEdge.note}
        </Typography>
        {selectedEdge.inferredFrom ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {selectedEdge.inferredFrom}
          </Typography>
        ) : null}
      </Box>
    );
  }

  if (selectedNode) {
    const related = getRelatedEdges(selectedNode.id, edges).slice(0, 6);
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{selectedNode.name}</Typography>
        {selectedNode.role ? <Typography variant="caption" color="text.secondary">{selectedNode.role}</Typography> : null}
        {selectedNode.summary ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {selectedNode.summary}
          </Typography>
        ) : null}
        {related.length ? (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
            {related.map((edge) => {
              const otherId = edge.fromId === selectedNode.id ? edge.toId : edge.fromId;
              return <Chip key={edge.id} size="small" variant="outlined" label={nodes.get(otherId)?.name || otherId} />;
            })}
          </Box>
        ) : null}
      </Box>
    );
  }

  return null;
}

function NetworkNode({
  node,
  label,
  x,
  y,
  selected,
  onClick,
  onHover,
}: {
  node?: CharacterRelationshipViewNode;
  label?: string;
  x: number;
  y: number;
  selected: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      sx={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        maxWidth: { xs: 112, sm: 144 },
        px: 1,
        py: 0.5,
        borderRadius: 999,
        bgcolor: selected ? 'primary.main' : 'background.paper',
        color: selected ? 'primary.contrastText' : 'text.primary',
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        boxShadow: selected ? '0 8px 22px rgba(0,0,0,0.18)' : '0 4px 12px rgba(0,0,0,0.10)',
        cursor: 'pointer',
        font: 'inherit',
        transition: (theme) => theme.transitions.create(['background-color', 'border-color', 'box-shadow', 'transform'], { duration: theme.transitions.duration.shortest }),
        '&:hover': {
          transform: 'translate(-50%, -50%) scale(1.04)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.20)',
        },
      }}
    >
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.15 }}>
        {label || node?.name || ''}
      </Typography>
    </Box>
  );
}

function OverviewNetwork({
  nodes,
  edges,
  nodeMap,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
}: {
  nodes: CharacterRelationshipViewNode[];
  edges: CharacterRelationshipViewEdge[];
  nodeMap: Map<string, CharacterRelationshipViewNode>;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
}) {
  const visibleNodes = nodes.slice(0, 18);
  const positions = getOverviewNodePositions(visibleNodes.length);
  const positionMap = new Map(visibleNodes.map((node, index) => [node.id, positions[index]]));
  const visibleEdges = edges
    .filter((edge) => positionMap.has(edge.fromId) && positionMap.has(edge.toId))
    .slice(0, 36);

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>关系总览</Typography>
        <Chip size="small" variant="outlined" label={`${nodes.length}人 · ${edges.length}条关系`} />
      </Box>
      <Box sx={{ position: 'relative', minHeight: { xs: 260, md: 320 }, borderRadius: 2, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box component="svg" viewBox="0 0 360 260" preserveAspectRatio="none" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {visibleEdges.map((edge) => {
            const from = positionMap.get(edge.fromId);
            const to = positionMap.get(edge.toId);
            if (!from || !to) return null;
            const selected = edge.id === selectedEdgeId;
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={getToneStroke(edge.tone)}
                strokeOpacity={selected ? 0.78 : 0.34}
                strokeWidth={selected ? 4 : Math.max(1.4, Math.min(4, (edge.strength || 50) / 26))}
                strokeDasharray={edge.tone === 'mixed' ? '6 4' : undefined}
                onMouseEnter={() => onSelectEdge(edge.id)}
                onClick={() => onSelectEdge(edge.id)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
        </Box>
        {visibleNodes.map((node, index) => {
          const position = positions[index];
          return (
            <NetworkNode
              key={node.id}
              node={nodeMap.get(node.id)}
              label={node.graphName || node.name}
              x={(position.x / 360) * 100}
              y={(position.y / 260) * 100}
              selected={node.id === selectedNodeId}
              onClick={() => onSelectNode(node.id)}
              onHover={() => onSelectNode(node.id)}
            />
          );
        })}
      </Box>
    </Box>
  );
}

function CircleNetworkPreview({
  circle,
  nodeMap,
  edgeMap,
}: {
  circle: CharacterRelationshipViewCircle;
  nodeMap: Map<string, CharacterRelationshipViewNode>;
  edgeMap: Map<string, CharacterRelationshipViewEdge>;
}) {
  const nodeIds = circle.nodeIds.slice(0, 7);
  const positions = getNodePositions(nodeIds.length);
  const positionMap = new Map(nodeIds.map((id, index) => [id, positions[index]]));
  const internalEdges = circle.keyEdgeIds
    .map((id) => edgeMap.get(id))
    .filter((edge): edge is CharacterRelationshipViewEdge => Boolean(edge))
    .filter((edge) => positionMap.has(edge.fromId) && positionMap.has(edge.toId))
    .slice(0, 10);

  return (
    <Box sx={{ position: 'relative', height: 156, borderRadius: 2, bgcolor: 'action.hover', overflow: 'hidden' }}>
      <Box
        component="svg"
        viewBox="0 0 240 148"
        preserveAspectRatio="none"
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {internalEdges.map((edge) => {
          const from = positionMap.get(edge.fromId);
          const to = positionMap.get(edge.toId);
          if (!from || !to) return null;
          return (
            <line
              key={edge.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={getToneStroke(edge.tone)}
              strokeOpacity={0.42}
              strokeWidth={Math.max(1.5, Math.min(4, (edge.strength || 50) / 24))}
              strokeDasharray={edge.tone === 'mixed' ? '5 4' : undefined}
            />
          );
        })}
      </Box>
      {nodeIds.map((id, index) => {
        const node = nodeMap.get(id);
        const position = positions[index];
        return (
          <Box
            key={id}
            sx={{
              position: 'absolute',
              left: `${(position.x / 240) * 100}%`,
              top: `${(position.y / 148) * 100}%`,
              transform: 'translate(-50%, -50%)',
              maxWidth: 96,
              px: 1,
              py: 0.5,
              borderRadius: 999,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
            }}
          >
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.15 }}>
              {node?.graphName || node?.name || id}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default function CharacterRelationshipView({ nodes, edges, circles = [], emptyTitle, emptyDescription }: CharacterRelationshipViewProps) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(edges.map((edge) => [edge.id, edge]));
  const visibleCircles = circles.length
    ? circles
    : nodes.length > 1
      ? [{ id: 'all', name: buildCircleNameFallback(1), nodeIds: nodes.map((node) => node.id), keyEdgeIds: edges.map((edge) => edge.id), bridgeEdgeIds: [] }]
      : [];
  const bridgeEdges = edges.filter((edge) => visibleCircles.some((circle) => circle.bridgeEdgeIds.includes(edge.id)));
  const bridgeEdgeIds = new Set(bridgeEdges.map((edge) => edge.id));
  const detailEdges = [...bridgeEdges, ...edges.filter((edge) => !bridgeEdgeIds.has(edge.id))].slice(0, 48);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodes[0]?.id || null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) || null : null;
  const selectedEdge = selectedEdgeId ? edgeMap.get(selectedEdgeId) || null : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {nodes.length > 1 ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.7fr) minmax(280px, 0.8fr)' }, gap: 1.25 }}>
          <OverviewNetwork
            nodes={nodes}
            edges={edges}
            nodeMap={nodeMap}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            onSelectNode={(id) => { setSelectedNodeId(id); setSelectedEdgeId(null); }}
            onSelectEdge={(id) => { setSelectedEdgeId(id); setSelectedNodeId(null); }}
          />
          <RelationshipInspector selectedNode={selectedNode} selectedEdge={selectedEdge} nodes={nodeMap} edges={edges} />
        </Box>
      ) : null}

      {visibleCircles.length ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          {visibleCircles.map((circle, index) => {
            const circleNodes = circle.nodeIds.map((id) => nodeMap.get(id)).filter((node): node is CharacterRelationshipViewNode => Boolean(node));
            const bridgeCount = circle.bridgeEdgeIds.length;
            return (
              <Box
                key={circle.id}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  p: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                  minWidth: 0,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {circle.name || buildCircleNameFallback(index)}
                    </Typography>
                    {circle.summary ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {circle.summary}
                      </Typography>
                    ) : null}
                  </Box>
                  <Chip size="small" label={`${circleNodes.length}人`} />
                </Box>
                <CircleNetworkPreview circle={circle} nodeMap={nodeMap} edgeMap={edgeMap} />
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {circleNodes.slice(0, 6).map((node) => (
                    <Chip key={node.id} size="small" variant="outlined" label={node.name} />
                  ))}
                  {bridgeCount ? <Chip size="small" color="warning" variant="outlined" label={`${bridgeCount}条跨圈联系`} /> : null}
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : null}

      {bridgeEdges.length ? (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>跨圈联系</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
            {bridgeEdges.slice(0, 8).map((edge) => {
              const from = nodeMap.get(edge.fromId);
              const to = nodeMap.get(edge.toId);
              return (
                <Box key={edge.id} sx={{ minWidth: 0, borderLeft: 3, borderColor: getToneColor(edge.tone), pl: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {from?.name || edge.fromId} {'->'} {to?.name || edge.toId}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {edge.note}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : null}

      {detailEdges.length ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            gap: 1,
          }}
        >
          {detailEdges.map((edge) => {
            const from = nodeMap.get(edge.fromId);
            const to = nodeMap.get(edge.toId);
            const tone = edge.tone || 'neutral';
            return (
              <Box
                key={edge.id}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  p: 1.5,
                  minWidth: 0,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, display: 'flex', gap: 0.75, alignItems: 'center', minWidth: 0 }}>
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from?.name || edge.fromId}</Box>
                  <Box component="span" sx={{ color: getToneColor(tone), flexShrink: 0 }}>{'->'}</Box>
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to?.name || edge.toId}</Box>
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
                  <Chip size="small" variant="outlined" label={toneLabels[tone]} sx={{ color: getToneColor(tone), borderColor: getToneColor(tone) }} />
                  {typeof edge.strength === 'number' ? <Chip size="small" variant="outlined" label={`强度 ${edge.strength}`} /> : null}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {edge.note}
                </Typography>
                {edge.inferredFrom ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {edge.inferredFrom}
                  </Typography>
                ) : null}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', p: 3, textAlign: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{emptyTitle}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{emptyDescription}</Typography>
        </Box>
      )}
    </Box>
  );
}
