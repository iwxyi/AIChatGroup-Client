import type { GroupChat, MessageBranchState } from '../types/chat';
import type { Message, MessageMetadata } from '../types/message';
import { logDeveloperDiagnostic } from './developerDiagnostics';

export interface ResolvedBranchingNode {
  message: Message;
  nodeId: string;
  parentNodeId: string | null;
  /** Whether parentNodeId came from persisted branching metadata. */
  parentNodeExplicit: boolean;
  revisionRootId: string;
  revisionOfMessageId: string | null;
}

export interface MessageBranchVersionInfo {
  rootId: string;
  index: number;
  total: number;
  isActive: boolean;
  activeNodeId: string;
  nodeIds: string[];
}

const DISABLED_SCENARIO_IDS = new Set([
  'story-reader',
  'werewolf-classic',
  'murder-mystery',
  'board-game',
]);

const DISABLED_MODES = new Set([
  'scripted_play',
  'werewolf',
  'murder_mystery',
  'board_game',
]);
const emptyProjectionDiagnostics = new Set<string>();
const collapsedProjectionDiagnostics = new Set<string>();

function diagnosticNodeKey(value: string | null | undefined) {
  if (!value) return null;
  return value.length <= 12 ? value : value.slice(-12);
}

type BranchableChat = Pick<GroupChat, 'sessionKind' | 'messageBranchState'> & Partial<Pick<GroupChat, 'mode'>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isDeletedMessage(message: Message) {
  return Boolean(message.isDeleted);
}

function compareMessageOrder(left: Message, right: Message) {
  if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
  return String(left.id || '').localeCompare(String(right.id || ''));
}

function normalizeBranchState(state: MessageBranchState | null | undefined): MessageBranchState {
  return {
    enabled: state?.enabled,
    activeLeafNodeId: state?.activeLeafNodeId ?? null,
    activeChildByParentNodeId: state?.activeChildByParentNodeId || {},
    selectedRevisionByRootId: state?.selectedRevisionByRootId || {},
    updatedAt: state?.updatedAt,
  };
}

export function isMessageBranchingEnabled(chat: BranchableChat | null | undefined) {
  if (!chat) return false;
  if (chat.messageBranchState?.enabled === false) return false;
  const scenarioId = chat.sessionKind?.scenarioId;
  if (!scenarioId) return false;
  if (DISABLED_SCENARIO_IDS.has(scenarioId)) return false;
  if (chat.mode && DISABLED_MODES.has(chat.mode)) return false;
  return true;
}

function getBranchingMetadata(message: Message): NonNullable<MessageMetadata['branching']> | null {
  const branching = message.metadata?.branching;
  return isRecord(branching) ? branching as NonNullable<MessageMetadata['branching']> : null;
}

function resolveBranchingNode(message: Message, parentNodeId: string | null): ResolvedBranchingNode {
  const branching = getBranchingMetadata(message);
  // Cloud persistence replaces local ids with server UUIDs, while branch
  // references remain keyed by the stable client key.
  const stableMessageId = message.clientKey || message.id;
  return {
    message,
    nodeId: typeof branching?.nodeId === 'string' && branching.nodeId.trim() ? branching.nodeId.trim() : stableMessageId,
    parentNodeId: branching && Object.prototype.hasOwnProperty.call(branching, 'parentNodeId')
      ? (typeof branching.parentNodeId === 'string' && branching.parentNodeId.trim() ? branching.parentNodeId.trim() : null)
      : parentNodeId,
    parentNodeExplicit: Boolean(branching && Object.prototype.hasOwnProperty.call(branching, 'parentNodeId')),
    revisionRootId: typeof branching?.revisionRootId === 'string' && branching.revisionRootId.trim()
      ? branching.revisionRootId.trim()
      : stableMessageId,
    revisionOfMessageId: typeof branching?.revisionOfMessageId === 'string' && branching.revisionOfMessageId.trim()
      ? branching.revisionOfMessageId.trim()
      : null,
  };
}

export function resolveMessageBranchNodes(messages: Message[]) {
  const visibleMessages = messages
    .filter((message) => !isDeletedMessage(message))
    .slice()
    .sort(compareMessageOrder);
  const rawNodes: ResolvedBranchingNode[] = [];
  let previousNodeId: string | null = null;
  for (const message of visibleMessages) {
    const branching = getBranchingMetadata(message);
    const explicitParent = Boolean(branching && Object.prototype.hasOwnProperty.call(branching, 'parentNodeId'));
    const node = resolveBranchingNode(message, previousNodeId);
    rawNodes.push({
      ...node,
      parentNodeId: explicitParent ? node.parentNodeId : previousNodeId,
      parentNodeExplicit: explicitParent,
    });
    previousNodeId = node.nodeId;
  }
  const identityAliases = new Map<string, string>();
  for (const node of rawNodes) {
    identityAliases.set(node.nodeId, node.nodeId);
    identityAliases.set(node.message.id, node.nodeId);
    if (node.message.clientKey) identityAliases.set(node.message.clientKey, node.nodeId);
    if (node.message.serverId) identityAliases.set(node.message.serverId, node.nodeId);
  }
  const canonicalNodes = rawNodes.map((node) => ({
    ...node,
    parentNodeId: node.parentNodeId ? (identityAliases.get(node.parentNodeId) || node.parentNodeId) : null,
    revisionRootId: identityAliases.get(node.revisionRootId) || node.revisionRootId,
    revisionOfMessageId: node.revisionOfMessageId ? (identityAliases.get(node.revisionOfMessageId) || node.revisionOfMessageId) : null,
  }));
  const availableNodeIds = new Set(canonicalNodes.map((node) => node.nodeId));
  const nodesById = new Map(canonicalNodes.map((node) => [node.nodeId, node]));
  return canonicalNodes.map((node, index) => {
    if (!node.parentNodeId || availableNodeIds.has(node.parentNodeId)) return node;
    // A window may start after the common parent of an original message and
    // one of its revisions. A revision must remain a sibling of its root;
    // attaching it to the preceding retained message makes it a descendant of
    // the old branch, so selecting the revision recursively removes itself.
    const revisionRoot = nodesById.get(node.revisionRootId)
      || canonicalNodes.find((candidate) => candidate.message.id === node.revisionOfMessageId
        || candidate.message.clientKey === node.revisionOfMessageId
        || candidate.message.serverId === node.revisionOfMessageId);
    if (node.revisionOfMessageId && revisionRoot) {
      return {
        ...node,
        parentNodeId: revisionRoot.parentNodeId,
      };
    }
    return {
      ...node,
        parentNodeId: canonicalNodes[index - 1]?.nodeId || null,
    };
  });
}

function buildChildrenByParent(nodes: ResolvedBranchingNode[]) {
  const map = new Map<string, ResolvedBranchingNode[]>();
  for (const node of nodes) {
    const key = node.parentNodeId || '';
    const list = map.get(key) || [];
    list.push(node);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((left, right) => compareMessageOrder(left.message, right.message));
  }
  return map;
}

/**
 * Render the projected branch in tree order, not raw creation/timestamp order.
 * A revision is normally created after its old continuation, so timestamp
 * sorting can produce `A1/B1/B2/A2-new` even when the parent graph says that
 * `A2-new` is the next message after `B1`.
 */
function orderBranchNodes(nodes: ResolvedBranchingNode[]) {
  const childrenByParent = buildChildrenByParent(nodes);
  const available = new Set(nodes.map((node) => node.nodeId));
  const roots = nodes
    .filter((node) => !node.parentNodeId || !available.has(node.parentNodeId))
    .sort((left, right) => compareMessageOrder(left.message, right.message));
  const ordered: ResolvedBranchingNode[] = [];
  const visited = new Set<string>();
  const visit = (node: ResolvedBranchingNode) => {
    if (visited.has(node.nodeId)) return;
    visited.add(node.nodeId);
    ordered.push(node);
    for (const child of childrenByParent.get(node.nodeId) || []) visit(child);
  };
  roots.forEach(visit);
  // Preserve partial-window nodes and malformed/cyclic leftovers without
  // dropping them; their relative order falls back to message order.
  nodes.slice().sort((left, right) => compareMessageOrder(left.message, right.message)).forEach(visit);
  return ordered;
}

function resolveSiblingGroupRootId(children: ResolvedBranchingNode[]) {
  const explicitRoot = children.find((child) => child.revisionRootId)?.revisionRootId;
  return explicitRoot || children[0]?.message.id || '';
}

function resolveSelectedChildId(
  chat: BranchableChat | null | undefined,
  parentNodeId: string | null,
  siblingGroupRootId: string,
  children: ResolvedBranchingNode[],
) {
  const state = normalizeBranchState(chat?.messageBranchState);
  const byRoot = state.selectedRevisionByRootId?.[siblingGroupRootId];
  if (byRoot && children.some((child) => child.nodeId === byRoot)) return byRoot;
  if (parentNodeId) {
    const byParent = state.activeChildByParentNodeId?.[parentNodeId];
    if (byParent && children.some((child) => child.nodeId === byParent)) return byParent;
  }
  const original = children.find((child) => child.nodeId === siblingGroupRootId)
    || children.find((child) => !child.revisionOfMessageId);
  return original?.nodeId || children[0]?.nodeId || null;
}

function normalizeBranchStateReferences(chat: BranchableChat | null | undefined, nodes: ResolvedBranchingNode[]): BranchableChat | null | undefined {
  if (!chat?.messageBranchState) return chat;
  const aliases = new Map<string, string>();
  for (const node of nodes) {
    aliases.set(node.nodeId, node.nodeId);
    aliases.set(node.message.id, node.nodeId);
    if (node.message.clientKey) aliases.set(node.message.clientKey, node.nodeId);
    if (node.message.serverId) aliases.set(node.message.serverId, node.nodeId);
  }
  const normalizeReference = (value: string) => aliases.get(value) || value;
  const state = normalizeBranchState(chat.messageBranchState);
  return {
    ...chat,
    messageBranchState: {
      ...state,
      activeLeafNodeId: state.activeLeafNodeId ? normalizeReference(state.activeLeafNodeId) : null,
      selectedRevisionByRootId: Object.fromEntries(Object.entries(state.selectedRevisionByRootId || {})
        .map(([rootId, selectedId]) => [normalizeReference(rootId), normalizeReference(selectedId)])),
      activeChildByParentNodeId: Object.fromEntries(Object.entries(state.activeChildByParentNodeId || {})
        .map(([parentId, childId]) => [normalizeReference(parentId), normalizeReference(childId)])),
    },
  };
}

export function projectActiveBranchMessages(chat: BranchableChat | null | undefined, messages: Message[]) {
  return projectActiveBranchMessagesInternal(chat, messages);
}

function projectActiveBranchMessagesInternal(chat: BranchableChat | null | undefined, messages: Message[]) {
  if (!isMessageBranchingEnabled(chat)) {
    return messages
      .filter((message) => !isDeletedMessage(message))
      .slice()
      .sort(compareMessageOrder);
  }
  const nodes = resolveMessageBranchNodes(messages);
  if (!nodes.length) return [];
  const normalizedChat = normalizeBranchStateReferences(chat, nodes);
  const childrenByParent = buildChildrenByParent(nodes);
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  const revisionGroups = new Map<string, ResolvedBranchingNode[]>();
  for (const node of nodes) {
    if (!node.revisionOfMessageId && node.revisionRootId === node.nodeId) continue;
    const group = revisionGroups.get(node.revisionRootId) || [];
    group.push(node);
    const rootNode = nodeById.get(node.revisionRootId);
    if (rootNode && !group.some((item) => item.nodeId === rootNode.nodeId)) group.push(rootNode);
    revisionGroups.set(node.revisionRootId, group);
  }

  const inactiveNodeIds = new Set<string>();
  const replacementParentByInactiveNodeId = new Map<string, string>();
  for (const [revisionRootId, rawGroup] of revisionGroups.entries()) {
    const group = Array.from(new Map(rawGroup.map((node) => [node.nodeId, node])).values())
      .sort((left, right) => compareMessageOrder(left.message, right.message));
    if (group.length <= 1) continue;
    const parentNodeId = group.find((node) => node.parentNodeId)?.parentNodeId || null;
    const selectedNodeId = resolveSelectedChildId(normalizedChat, parentNodeId, revisionRootId, group);
    for (const node of group) {
      if (node.nodeId !== selectedNodeId) {
        inactiveNodeIds.add(node.nodeId);
        replacementParentByInactiveNodeId.set(node.nodeId, selectedNodeId);
      }
    }
  }

  const excludedNodeIds = new Set<string>();
  const excludeSubtree = (nodeId: string) => {
    if (excludedNodeIds.has(nodeId)) return;
    excludedNodeIds.add(nodeId);
    // Only persisted branch links are safe to recurse through. Legacy/plain
    // messages have a locally inferred parent based on the retained window;
    // when an older page is prepended that inference can change and would
    // otherwise make an unrelated tail disappear as part of an inactive
    // branch subtree.
    for (const child of childrenByParent.get(nodeId) || []) {
      if (child.parentNodeExplicit) excludeSubtree(child.nodeId);
    }
  };
  for (const nodeId of inactiveNodeIds) excludeSubtree(nodeId);

  const projectedNodes = nodes
    .filter((node) => !excludedNodeIds.has(node.nodeId))
    .map((node) => {
      // Older conversations may contain plain continuation messages without
      // persisted branch metadata. If their inferred parent belongs to an
      // inactive revision, keep them visible but place them after the
      // selected revision instead of letting timestamp ordering put them
      // before the edited message.
      if (!node.parentNodeExplicit && node.parentNodeId) {
        const replacementParent = replacementParentByInactiveNodeId.get(node.parentNodeId);
        if (replacementParent) return { ...node, parentNodeId: replacementParent };
      }
      return node;
    });
  let activeMessages = orderBranchNodes(projectedNodes)
    .map((node) => node.message);
  if (nodes.length > 2 && activeMessages.length <= 2) {
    const diagnosticKey = `${nodes.length}:${activeMessages.length}:${inactiveNodeIds.size}:${excludedNodeIds.size}:${activeMessages.map((message) => diagnosticNodeKey(message.clientKey || message.id)).join(',')}`;
    if (!collapsedProjectionDiagnostics.has(diagnosticKey)) {
      collapsedProjectionDiagnostics.add(diagnosticKey);
      logDeveloperDiagnostic('message-branch:projection-collapse', {
        inputMessages: messages.length,
        resolvedNodes: nodes.length,
        projectedMessages: activeMessages.length,
        inactiveNodes: inactiveNodeIds.size,
        excludedNodes: excludedNodeIds.size,
        revisionGroups: revisionGroups.size,
        projectedSample: activeMessages.map((message) => diagnosticNodeKey(message.clientKey || message.id)),
        inactiveSample: Array.from(inactiveNodeIds).slice(0, 5).map(diagnosticNodeKey),
        excludedSample: Array.from(excludedNodeIds).slice(0, 5).map(diagnosticNodeKey),
        selectedRevisionCount: Object.keys(normalizedChat?.messageBranchState?.selectedRevisionByRootId || {}).length,
        activeChildCount: Object.keys(normalizedChat?.messageBranchState?.activeChildByParentNodeId || {}).length,
        activeLeaf: diagnosticNodeKey(normalizedChat?.messageBranchState?.activeLeafNodeId),
      }, 'warn', 'message-window');
    }
  }
  if (nodes.length > 8 && activeMessages.length < Math.ceil(nodes.length * 0.7)) {
    const diagnosticKey = `${nodes.length}:${activeMessages.length}:${inactiveNodeIds.size}:${excludedNodeIds.size}`;
    if (!collapsedProjectionDiagnostics.has(`shrink:${diagnosticKey}`)) {
      collapsedProjectionDiagnostics.add(`shrink:${diagnosticKey}`);
      logDeveloperDiagnostic('message-branch:projection-shrink', {
        inputMessages: messages.length,
        resolvedNodes: nodes.length,
        projectedMessages: activeMessages.length,
        inactiveNodes: inactiveNodeIds.size,
        excludedNodes: excludedNodeIds.size,
        revisionGroups: Array.from(revisionGroups.entries()).map(([rootId, group]) => ({
          rootId: diagnosticNodeKey(rootId),
          nodes: group.map((node) => ({
            id: diagnosticNodeKey(node.nodeId),
            parent: diagnosticNodeKey(node.parentNodeId),
            explicitParent: node.parentNodeExplicit,
            revisionOf: diagnosticNodeKey(node.revisionOfMessageId),
          })),
        })).slice(0, 12),
        projectedSample: activeMessages.slice(0, 12).map((message) => diagnosticNodeKey(message.clientKey || message.id)),
        excludedSample: Array.from(excludedNodeIds).slice(0, 12).map(diagnosticNodeKey),
        revisionGroupsJson: JSON.stringify(Array.from(revisionGroups.entries()).map(([rootId, group]) => ({
          rootId: diagnosticNodeKey(rootId),
          nodes: group.map((node) => ({
            id: diagnosticNodeKey(node.nodeId),
            parent: diagnosticNodeKey(node.parentNodeId),
            explicitParent: node.parentNodeExplicit,
            revisionOf: diagnosticNodeKey(node.revisionOfMessageId),
          })),
        })).slice(0, 12)),
      }, 'warn', 'message-window');
    }
  }
  // A revision can legitimately remove one old continuation, but it must not
  // collapse a large paged transcript into a handful of nodes. That indicates
  // stale/incomplete branch state (typically a parent inferred differently
  // after an older page was prepended). Keep the complete ordered window so
  // pagination never destroys the visible conversation; the error diagnostic
  // remains available for repairing the persisted branch state.
  if (nodes.length > 8 && activeMessages.length * 2 < nodes.length) {
    logDeveloperDiagnostic('message-branch:projection-invalid', {
      inputMessages: messages.length,
      resolvedNodes: nodes.length,
      projectedMessages: activeMessages.length,
      inactiveNodes: inactiveNodeIds.size,
      excludedNodes: excludedNodeIds.size,
      reason: 'projection_less_than_half_of_window',
    }, 'error', 'message-window');
    activeMessages = orderBranchNodes(nodes).map((node) => node.message);
  }
  if (messages.some((message) => !isDeletedMessage(message)) && activeMessages.length === 0) {
    const diagnosticKey = `${nodes.length}:${inactiveNodeIds.size}:${excludedNodeIds.size}:${Array.from(excludedNodeIds).slice(0, 3).join(',')}`;
    if (!emptyProjectionDiagnostics.has(diagnosticKey)) {
      emptyProjectionDiagnostics.add(diagnosticKey);
      logDeveloperDiagnostic('message-branch:empty-projection', {
      inputMessages: messages.length,
      nodes: nodes.length,
      visibleInputMessages: messages.filter((message) => !isDeletedMessage(message)).length,
      inactiveNodes: inactiveNodeIds.size,
      excludedNodes: excludedNodeIds.size,
      inactiveNodeSample: Array.from(inactiveNodeIds).slice(0, 3),
      excludedNodeSample: Array.from(excludedNodeIds).slice(0, 3),
      rootNodeCount: nodes.filter((node) => !node.parentNodeId || !nodeById.has(node.parentNodeId)).length,
      selectedRevisionCount: Object.keys(normalizedChat?.messageBranchState?.selectedRevisionByRootId || {}).length,
      activeChildCount: Object.keys(normalizedChat?.messageBranchState?.activeChildByParentNodeId || {}).length,
      }, 'error', 'message-window');
    }
    // Never drop a valid transcript because branch state is inconsistent. In
    // this state the graph cannot prove a single active path, so expose the
    // complete ordered window until the branch state is repaired.
    activeMessages = orderBranchNodes(nodes).map((node) => node.message);
  }
  return activeMessages;
}

export function getActiveBranchTail(chat: BranchableChat | null | undefined, messages: Message[]) {
  return projectActiveBranchMessages(chat, messages).at(-1) || null;
}

export function getActiveBranchTailNode(chat: BranchableChat | null | undefined, messages: Message[]) {
  const activeTail = getActiveBranchTail(chat, messages);
  if (!activeTail) return null;
  return resolveMessageBranchNodes(messages).find((node) => node.message.id === activeTail.id || node.nodeId === activeTail.id) || null;
}

export function attachMessageToActiveBranch<T extends { metadata?: MessageMetadata } & Record<string, unknown>>(
  chat: Pick<GroupChat, 'messageBranchState' | 'sessionKind'> | null | undefined,
  activeMessages: Message[],
  message: T,
) {
  if (!isMessageBranchingEnabled(chat)) return message;
  if (message.metadata?.branching?.parentNodeId !== undefined) return message;
  const nodes = resolveMessageBranchNodes(activeMessages);
  const activeLeafId = chat?.messageBranchState?.activeLeafNodeId;
  const tailNode = (activeLeafId
    ? nodes.find((node) => node.nodeId === activeLeafId || node.message.id === activeLeafId || node.message.clientKey === activeLeafId)
    : null) || getActiveBranchTailNode(chat, activeMessages);
  if (!tailNode) return message;
  return {
    ...message,
    metadata: {
      ...(message.metadata || {}),
      branching: {
        ...(message.metadata?.branching || {}),
        parentNodeId: tailNode?.nodeId || null,
      },
    } as MessageMetadata,
  };
}

export function getBranchRevisionGroup(messages: Message[], messageId: string) {
  const nodes = resolveMessageBranchNodes(messages);
  const targetNode = nodes.find((node) => node.message.id === messageId || node.nodeId === messageId || node.message.clientKey === messageId || node.message.serverId === messageId);
  if (!targetNode) return [];
  const groupRootId = targetNode.revisionRootId || targetNode.message.id;
  return nodes
    .filter((node) => node.revisionRootId === groupRootId || node.message.id === groupRootId)
    .map((node) => node.message)
    .sort(compareMessageOrder);
}

export function getMessageBranchVersionInfo(chat: BranchableChat | null | undefined, messages: Message[], messageId: string): MessageBranchVersionInfo | null {
  return buildMessageBranchVersionInfoByMessageId(chat, messages, [messageId])[messageId] || null;
}

export function buildMessageBranchVersionInfoByMessageId(
  chat: BranchableChat | null | undefined,
  messages: Message[],
  messageIds?: string[],
) {
    const nodes = nodesFromMessages(messages);
    if (!nodes.length) return {} as Record<string, MessageBranchVersionInfo>;
    const nodesByMessageKey = new Map<string, ResolvedBranchingNode>();
    const groupsByRootId = new Map<string, ResolvedBranchingNode[]>();
    for (const node of nodes) {
      nodesByMessageKey.set(node.message.id, node);
      if (node.message.clientKey) nodesByMessageKey.set(node.message.clientKey, node);
      if (node.message.serverId) nodesByMessageKey.set(node.message.serverId, node);
      nodesByMessageKey.set(node.nodeId, node);
      const group = groupsByRootId.get(node.revisionRootId) || [];
      group.push(node);
      groupsByRootId.set(node.revisionRootId, group);
    }
    const branchedRootIds = new Set<string>();
    for (const [rootId, group] of groupsByRootId.entries()) {
      const uniqueNodeIds = new Set(group.map((node) => node.nodeId));
      if (uniqueNodeIds.size > 1) branchedRootIds.add(rootId);
    }
    if (!branchedRootIds.size) return {} as Record<string, MessageBranchVersionInfo>;

    const activeMessages = projectActiveBranchMessagesInternal(chat, messages);
    const activeMessageKeys = new Set<string>();
    for (const message of activeMessages) {
      activeMessageKeys.add(message.id);
      if (message.clientKey) activeMessageKeys.add(message.clientKey);
      if (message.serverId) activeMessageKeys.add(message.serverId);
    }
    const activeNodeId = activeMessages.at(-1)?.id || '';
    const requestedIds = messageIds?.length ? messageIds : messages.map((message) => message.id);
    const result: Record<string, MessageBranchVersionInfo> = {};
    const cachedGroupInfo = new Map<string, { sortedGroup: ResolvedBranchingNode[]; nodeIds: string[] }>();
    for (const messageId of requestedIds) {
      const target = nodesByMessageKey.get(messageId);
      if (!target) continue;
      const rootId = target.revisionRootId || target.message.id || messageId;
      if (!branchedRootIds.has(rootId)) continue;
      let groupInfo = cachedGroupInfo.get(rootId);
      if (!groupInfo) {
        const sortedGroup = (groupsByRootId.get(rootId) || [])
          .filter((node) => node.revisionRootId === rootId || node.message.id === rootId)
          .sort((left, right) => compareMessageOrder(left.message, right.message));
        groupInfo = {
          sortedGroup,
          nodeIds: sortedGroup.map((node) => node.message.id),
        };
        cachedGroupInfo.set(rootId, groupInfo);
      }
      if (!groupInfo.sortedGroup.length) continue;
      const index = groupInfo.sortedGroup.findIndex((node) => (
        node.message.id === messageId
        || node.message.clientKey === messageId
        || node.message.serverId === messageId
        || node.nodeId === messageId
      ));
      result[messageId] = {
        rootId,
        index: index >= 0 ? index + 1 : 1,
        total: groupInfo.sortedGroup.length,
        isActive: activeMessageKeys.has(target.message.id)
          || Boolean(target.message.clientKey && activeMessageKeys.has(target.message.clientKey))
          || Boolean(target.message.serverId && activeMessageKeys.has(target.message.serverId)),
        activeNodeId,
        nodeIds: groupInfo.nodeIds,
      };
    }
    return result;
}

function nodesFromMessages(messages: Message[]) {
  return resolveMessageBranchNodes(messages);
}

export function createMessageRevisionDraft(params: {
  sourceMessage: Message;
  parentNodeId: string | null;
  content: string;
  timestamp?: number;
  senderId?: string;
  senderName?: string;
  emotion?: number;
  metadata?: MessageMetadata;
  nodeId?: string;
  revisionRootId?: string | null;
}) {
  const sourceBranching = getBranchingMetadata(params.sourceMessage);
  const stableSourceId = params.sourceMessage.clientKey || params.sourceMessage.id;
  const revisionRootId = params.revisionRootId || sourceBranching?.revisionRootId || stableSourceId;
  const branching = {
    ...(params.sourceMessage.metadata?.branching || {}),
    ...(params.metadata?.branching || {}),
    ...(params.nodeId ? { nodeId: params.nodeId } : {}),
    parentNodeId: params.parentNodeId,
    revisionRootId,
    revisionOfMessageId: params.sourceMessage.clientKey || params.sourceMessage.id,
    createdFromMessageId: params.sourceMessage.clientKey || params.sourceMessage.id,
  };
  return {
    chatId: params.sourceMessage.chatId,
    type: params.sourceMessage.type,
    senderId: params.senderId || params.sourceMessage.senderId,
    senderName: params.senderName || params.sourceMessage.senderName,
    content: params.content,
    metadata: {
      ...(params.sourceMessage.metadata || {}),
      ...(params.metadata || {}),
      branching,
    } as MessageMetadata,
    emotion: typeof params.emotion === 'number' ? params.emotion : params.sourceMessage.emotion,
    timestamp: typeof params.timestamp === 'number' ? params.timestamp : Date.now(),
  };
}

export function getRevisionSiblingIndex(chat: BranchableChat | null | undefined, messages: Message[], messageId: string) {
  const info = getMessageBranchVersionInfo(chat, messages, messageId);
  return info ? `${info.index}/${info.total}` : null;
}
