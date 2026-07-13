import { storageKey } from '../constants/brand';

const ASSISTANT_ARTIFACT_CLOUD_SYNC_ENABLED_KEY = storageKey('assistant-artifact-cloud-sync-enabled');

export function isAssistantArtifactCloudSyncEnabled() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(ASSISTANT_ARTIFACT_CLOUD_SYNC_ENABLED_KEY) === '1';
}

export function setAssistantArtifactCloudSyncEnabled(enabled: boolean) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ASSISTANT_ARTIFACT_CLOUD_SYNC_ENABLED_KEY, enabled ? '1' : '0');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pneumata-assistant-artifact-cloud-sync-preference-changed', { detail: { enabled } }));
  }
}
