import type { AICharacter } from '../types/character';
import type { Message, MessageAttachment, MessageMetadata } from '../types/message';
import { isAIProfileUsable, type AIModelProfile } from '../types/settings';
import { api } from './api';
import { generateImageWithAdapter, synthesizeSpeechWithAdapter } from './aiGenerationAdapter';
import { storageKey } from '../constants/brand';
import { reportRecoverableError } from './diagnostics';
import { isCloudSyncEnabled } from './cloudSyncPreference';

function findProfile(profiles: AIModelProfile[], id?: string | null) {
  const profile = id ? profiles.find((item) => item.id === id) : null;
  return isAIProfileUsable(profile) ? profile : null;
}

function findGenerationProfile(profiles: AIModelProfile[], type: 'image' | 'audio', id?: string | null) {
  const profile = findProfile(profiles, id)
    || profiles.find((item) => item.type === type && item.isDefault && isAIProfileUsable(item))
    || profiles.find((item) => item.type === type && isAIProfileUsable(item));
  return isAIProfileUsable(profile) ? profile : null;
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

async function ensureDataUrl(value: string) {
  if (value.startsWith('data:')) return value;
  const response = await fetch(value);
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

export function isLocalOnlyMediaMode() {
  return !isCloudSyncEnabled() || (typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey('auth-mode')) : 'local') !== 'cloud';
}

function updateAttachment(metadata: MessageMetadata | undefined, attachmentId: string, patch: Partial<MessageAttachment>): MessageMetadata {
  const attachments = (metadata?.attachments || []).map((attachment) => (
    attachment.id === attachmentId ? { ...attachment, ...patch, updatedAt: Date.now() } : attachment
  ));
  const generationStatus = attachments.some((item) => item.status === 'queued' || item.status === 'generating')
    ? 'generating'
    : attachments.some((item) => item.status === 'failed')
      ? 'failed'
      : 'ready';
  return {
    ...(metadata || {}),
    attachments,
    generation: {
      ...(metadata?.generation || {}),
      status: generationStatus,
      updatedAt: Date.now(),
    },
  };
}

async function attachAssistantImageArtifact(params: {
  message: Message;
  attachmentId: string;
  upsertMessage: (message: Message) => void;
}) {
  const attachment = params.message.metadata?.attachments?.find((item) => item.id === params.attachmentId);
  if (!attachment || attachment.kind !== 'image' || attachment.status !== 'ready' || !attachment.assetId) return params.message;
  const [{ useChatStore }, { useAssistantArtifactStore }] = await Promise.all([
    import('../stores/useChatStore'),
    import('../stores/useAssistantArtifactStore'),
  ]);
  const chat = useChatStore.getState().chats.find((item) => item.id === params.message.chatId);
  if (chat?.type !== 'assistant') return params.message;
  const capabilities = chat.modeState.assistantCapabilities || {};
  if (!capabilities.agent || !capabilities.artifacts) return params.message;
  const artifact = useAssistantArtifactStore.getState().createImageArtifactFromAttachment({
    chatId: params.message.chatId,
    message: params.message,
    attachment,
    timestamp: Date.now(),
  });
  if (!artifact) return params.message;
  const existingRefs = params.message.metadata?.assistant?.artifacts || [];
  if (existingRefs.some((ref) => ref.id === artifact.id)) return params.message;
  const metadata: MessageMetadata = {
    ...(params.message.metadata || {}),
    assistant: {
      ...(params.message.metadata?.assistant || {}),
      mode: 'general',
      artifacts: [...existingRefs, { id: artifact.id, kind: artifact.kind, title: artifact.title }],
    },
  };
  const nextMessage = { ...params.message, metadata };
  params.upsertMessage(nextMessage);
  if (!isLocalOnlyMediaMode()) void api.updateMessageMetadata(nextMessage.serverId || nextMessage.id, metadata).catch(() => undefined);
  return nextMessage;
}

export async function processRichMessageMedia(params: {
  message: Message;
  character?: AICharacter | null;
  characters?: AICharacter[];
  aiProfiles: AIModelProfile[];
  upsertMessage: (message: Message) => void;
}) {
  const attachments = params.message.metadata?.attachments || [];
  if (!attachments.some((item) => item.status === 'queued')) return;

  for (const attachment of attachments) {
    if (attachment.status !== 'queued') continue;
    const generatingMetadata = updateAttachment(params.message.metadata, attachment.id, { status: 'generating' });
    let currentMessage: Message = { ...params.message, metadata: generatingMetadata };
    params.upsertMessage(currentMessage);
    if (!isLocalOnlyMediaMode()) void api.updateMessageMetadata(currentMessage.serverId || currentMessage.id, generatingMetadata).catch(() => undefined);

    try {
      if (attachment.kind === 'image') {
        const profile = findGenerationProfile(params.aiProfiles, 'image', params.character?.modelProfileIds?.image);
        if (!profile || !attachment.promptText) throw new Error('图片模型未配置');
        const referenceCharacters = (attachment.referenceCharacterIds || [])
          .map((id) => params.characters?.find((character) => character.id === id))
          .filter(Boolean) as AICharacter[];
        const visualCharacter = referenceCharacters[0] || params.character || null;
        const images = await generateImageWithAdapter({
          profile,
          prompt: attachment.promptText,
          count: 1,
          intent: 'chat-image',
          character: referenceCharacters.length ? null : params.character,
          characters: referenceCharacters,
          referenceImages: attachment.referenceImages,
          aspectRatio: attachment.aspectRatio,
          imageSize: attachment.imageSize,
          allowCharacterReferenceImages: true,
          negativePrompt: visualCharacter?.visualIdentity?.negativePrompt,
          seed: visualCharacter?.visualIdentity?.seed,
        });
        const first = images[0];
        if (!first?.dataUrl) throw new Error('图片生成失败');
        const dataUrl = await ensureDataUrl(first.dataUrl);
        const asset = isLocalOnlyMediaMode()
          ? { id: undefined, url: dataUrl, mimeType: first.mimeType, sizeBytes: dataUrl.length, checksum: undefined }
          : await api.createMediaAsset({
              chatId: currentMessage.chatId,
              messageId: currentMessage.serverId || currentMessage.id,
              attachmentId: attachment.id,
              kind: 'image',
              dataUrl,
            });
        const readyMetadata = updateAttachment(currentMessage.metadata, attachment.id, {
          status: 'ready',
          assetId: asset.id,
          url: asset.url,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          checksum: asset.checksum,
        });
        currentMessage = { ...currentMessage, metadata: readyMetadata };
        params.upsertMessage(currentMessage);
        if (!isLocalOnlyMediaMode()) void api.updateMessageMetadata(currentMessage.serverId || currentMessage.id, readyMetadata).catch(() => undefined);
        currentMessage = await attachAssistantImageArtifact({
          message: currentMessage,
          attachmentId: attachment.id,
          upsertMessage: params.upsertMessage,
        });
      }

      if (attachment.kind === 'audio') {
        const profile = findGenerationProfile(params.aiProfiles, 'audio', params.character?.modelProfileIds?.audio);
        if (!profile) throw new Error('语音模型未配置');
        const voice = params.character?.voiceConfig?.voiceName || profile.model;
        const audio = await synthesizeSpeechWithAdapter({
          profile,
          intent: 'chat-audio',
          input: attachment.promptText || currentMessage.content,
          voice,
          format: 'mp3',
        });
        const dataUrl = await blobToDataUrl(audio.blob);
        const asset = isLocalOnlyMediaMode()
          ? { id: undefined, url: dataUrl, mimeType: audio.mimeType, sizeBytes: dataUrl.length, checksum: undefined }
          : await api.createMediaAsset({
              chatId: currentMessage.chatId,
              messageId: currentMessage.serverId || currentMessage.id,
              attachmentId: attachment.id,
              kind: 'audio',
              dataUrl,
            });
        const readyMetadata = updateAttachment(currentMessage.metadata, attachment.id, {
          status: 'ready',
          assetId: asset.id,
          url: asset.url,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
        });
        currentMessage = { ...currentMessage, metadata: readyMetadata };
        params.upsertMessage(currentMessage);
        if (!isLocalOnlyMediaMode()) void api.updateMessageMetadata(currentMessage.serverId || currentMessage.id, readyMetadata).catch(() => undefined);
      }
    } catch (error) {
      reportRecoverableError({
        location: 'rich-message-media.process',
        error,
        userMessage: attachment.kind === 'image' ? '图片生成失败。' : '语音生成失败。',
        extra: {
          messageId: currentMessage.id,
          attachmentId: attachment.id,
          attachmentKind: attachment.kind,
          senderId: currentMessage.senderId,
        },
      });
      const failedMetadata = updateAttachment(currentMessage.metadata, attachment.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      currentMessage = { ...currentMessage, metadata: failedMetadata };
      params.upsertMessage(currentMessage);
      if (!isLocalOnlyMediaMode()) void api.updateMessageMetadata(currentMessage.serverId || currentMessage.id, failedMetadata).catch(() => undefined);
    }
  }
}

export async function retryRichMessageMedia(params: {
  message: Message;
  attachmentId: string;
  character?: AICharacter | null;
  characters?: AICharacter[];
  aiProfiles: AIModelProfile[];
  upsertMessage: (message: Message) => void;
}) {
  const attachments = params.message.metadata?.attachments || [];
  const target = attachments.find((attachment) => attachment.id === params.attachmentId);
  if (!target || target.status !== 'failed') return;
  const retryMetadata = updateAttachment(params.message.metadata, params.attachmentId, {
    status: 'queued',
    error: undefined,
    assetId: undefined,
    url: undefined,
    sizeBytes: undefined,
    checksum: undefined,
  });
  const retryMessage = { ...params.message, metadata: retryMetadata };
  params.upsertMessage(retryMessage);
  if (!isLocalOnlyMediaMode()) void api.updateMessageMetadata(retryMessage.serverId || retryMessage.id, retryMetadata).catch(() => undefined);
  await processRichMessageMedia({
    message: retryMessage,
    character: params.character,
    characters: params.characters,
    aiProfiles: params.aiProfiles,
    upsertMessage: params.upsertMessage,
  });
}

export function hasLocalDataUrlMedia(message: Message) {
  return Boolean(message.metadata?.attachments?.some((attachment) => attachment.status === 'ready' && typeof attachment.url === 'string' && attachment.url.startsWith('data:')));
}

export function scrubLocalMediaUrlsForCloud(message: Message) {
  if (!message.metadata?.attachments?.length) return message.metadata;
  return {
    ...message.metadata,
    attachments: message.metadata.attachments.map((attachment) => {
      if (attachment.status === 'ready' && typeof attachment.url === 'string' && attachment.url.startsWith('data:')) {
        return {
          ...attachment,
          status: 'queued' as const,
          url: undefined,
          assetId: undefined,
          updatedAt: Date.now(),
        };
      }
      return attachment;
    }),
  };
}

export async function uploadLocalMessageMediaToCloud(params: {
  localMessage: Message;
  cloudMessage: Message;
}) {
  const attachments = params.localMessage.metadata?.attachments || [];
  if (!attachments.length) return params.cloudMessage.metadata;
  let nextMetadata = params.cloudMessage.metadata || scrubLocalMediaUrlsForCloud(params.localMessage);
  for (const attachment of attachments) {
    if (attachment.status !== 'ready' || !attachment.url?.startsWith('data:')) continue;
    const asset = await api.createMediaAsset({
      chatId: params.cloudMessage.chatId,
      messageId: params.cloudMessage.serverId || params.cloudMessage.id,
      attachmentId: attachment.id,
      kind: attachment.kind,
      dataUrl: attachment.url,
    });
    nextMetadata = updateAttachment(nextMetadata, attachment.id, {
      status: 'ready',
      assetId: asset.id,
      url: asset.url,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      checksum: asset.checksum,
    });
  }
  await api.updateMessageMetadata(params.cloudMessage.serverId || params.cloudMessage.id, nextMetadata);
  return nextMetadata;
}
