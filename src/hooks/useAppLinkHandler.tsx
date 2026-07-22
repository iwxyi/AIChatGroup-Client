import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';
import Button from '@mui/material/Button';
import { useNavigate } from 'react-router-dom';
import { parseAppLink, resolveAppLinkToWebPath, isLikelyExternalLink, type AppLink } from '../services/appLink';
import { useAssistantArtifactStore } from '../stores/useAssistantArtifactStore';
import { useCharacterStore } from '../stores/useCharacterStore';
import { useChatStore } from '../stores/useChatStore';

export type AppLinkFailureReason =
  | 'invalid_link'
  | 'not_found'
  | 'deleted'
  | 'unsupported_target';

export interface AppLinkFeedback {
  open: boolean;
  message: string;
  action?: ReactNode;
}

function entityMissingMessage(link: AppLink) {
  if (link.target === 'character') return '该角色不存在或尚未同步到当前设备。';
  if (link.target === 'chat') return '该会话不存在或尚未同步到当前设备。';
  if (link.target === 'assistant_artifact') return '该产物不存在或尚未同步到当前设备。';
  return '该链接目标不存在或暂不可用。';
}

function entityDeletedMessage(link: AppLink) {
  if (link.target === 'character') return '该角色已删除，可在回收站恢复后打开。';
  if (link.target === 'chat') return '该会话已删除，可在回收站恢复后打开。';
  if (link.target === 'assistant_artifact') return '该产物已删除或已从当前会话移除。';
  return '该链接目标已删除。';
}

function validateAppLink(link: AppLink): { ok: true } | { ok: false; reason: AppLinkFailureReason; message: string; recoveryPath?: string } {
  if (link.target === 'character') {
    if (!link.id) return { ok: false, reason: 'invalid_link', message: '角色链接缺少目标 ID。' };
    const character = useCharacterStore.getState().characters.find((item) => item.id === link.id);
    if (!character) return { ok: false, reason: 'not_found', message: entityMissingMessage(link) };
    if (character.deletedAt != null) return { ok: false, reason: 'deleted', message: entityDeletedMessage(link), recoveryPath: '/settings/recycle-bin' };
  }
  if (link.target === 'chat') {
    if (!link.id) return { ok: false, reason: 'invalid_link', message: '会话链接缺少目标 ID。' };
    const chat = useChatStore.getState().chats.find((item) => item.id === link.id);
    if (!chat) return { ok: false, reason: 'not_found', message: entityMissingMessage(link) };
    if (chat.deletedAt != null) return { ok: false, reason: 'deleted', message: entityDeletedMessage(link), recoveryPath: '/settings/recycle-bin' };
  }
  if (link.target === 'assistant_artifact') {
    if (!link.id) return { ok: false, reason: 'invalid_link', message: '产物链接缺少目标 ID。' };
    const artifact = useAssistantArtifactStore.getState().items.find((item) => item.id === link.id);
    if (!artifact) return { ok: false, reason: 'not_found', message: entityMissingMessage(link) };
    if (artifact.deletedAt != null) return { ok: false, reason: 'deleted', message: entityDeletedMessage(link) };
  }
  return { ok: true };
}

export function useAppLinkHandler() {
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<AppLinkFeedback>({ open: false, message: '' });

  const showFailure = useCallback((message: string, recoveryPath?: string) => {
    setFeedback({
      open: true,
      message,
      action: recoveryPath ? (
        <Button color="inherit" size="small" onClick={() => {
          setFeedback((prev) => ({ ...prev, open: false }));
          navigate(recoveryPath);
        }}>
          去处理
        </Button>
      ) : undefined,
    });
  }, [navigate]);

  const openAppHref = useCallback((href: string | null | undefined) => {
    const link = parseAppLink(href);
    if (!link) return false;
    const validation = validateAppLink(link);
    if (!validation.ok) {
      showFailure(validation.message, validation.recoveryPath);
      return true;
    }
    const path = resolveAppLinkToWebPath(link);
    if (!path) {
      showFailure('当前版本暂不支持打开这个应用内链接。');
      return true;
    }
    navigate(path);
    return true;
  }, [navigate, showFailure]);

  const handleAnchorClick = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string | null | undefined) => {
    if (!href || isLikelyExternalLink(href)) return;
    const handled = openAppHref(href);
    if (handled) event.preventDefault();
  }, [openAppHref]);

  const closeFeedback = useCallback(() => {
    setFeedback((prev) => ({ ...prev, open: false }));
  }, []);

  return {
    feedback,
    closeFeedback,
    handleAnchorClick,
    openAppHref,
  };
}
