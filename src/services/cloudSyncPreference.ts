import { storageKey } from '../constants/brand';

const CLOUD_SYNC_ENABLED_KEY = storageKey('cloud-sync-enabled');
const CLOUD_SYNC_USER_DISABLED_KEY = storageKey('cloud-sync-user-disabled');
const CLOUD_SYNC_USER_DISABLED_VERSION_KEY = storageKey('cloud-sync-user-disabled-version');
const CURRENT_USER_DISABLED_VERSION = '2';

type CloudSyncPreferenceSource = 'user' | 'auth' | 'entitlement';

export function isCloudSyncEnabled() {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(CLOUD_SYNC_ENABLED_KEY) !== '0';
}

export function isCloudSyncUserDisabled() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(CLOUD_SYNC_USER_DISABLED_KEY) === '1'
    && localStorage.getItem(CLOUD_SYNC_USER_DISABLED_VERSION_KEY) === CURRENT_USER_DISABLED_VERSION;
}

export function setCloudSyncEnabled(enabled: boolean, options: { source?: CloudSyncPreferenceSource } = {}) {
  if (typeof localStorage === 'undefined') return;
  const source = options.source || 'user';
  if (enabled && source !== 'user' && isCloudSyncUserDisabled()) return;
  localStorage.setItem(CLOUD_SYNC_ENABLED_KEY, enabled ? '1' : '0');
  if (enabled && source === 'user') {
    localStorage.removeItem(CLOUD_SYNC_USER_DISABLED_KEY);
    localStorage.removeItem(CLOUD_SYNC_USER_DISABLED_VERSION_KEY);
  } else if (source === 'user') {
    localStorage.setItem(CLOUD_SYNC_USER_DISABLED_KEY, '1');
    localStorage.setItem(CLOUD_SYNC_USER_DISABLED_VERSION_KEY, CURRENT_USER_DISABLED_VERSION);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pneumata-cloud-sync-preference-changed', { detail: { enabled } }));
  }
}
