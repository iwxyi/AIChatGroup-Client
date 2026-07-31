import { create } from 'zustand';
import type { SystemAnnouncementItem } from './api';

export const IN_APP_NOTIFICATION_POPUP_SEEN_KEY = 'pneumata.systemAnnouncement.popupSeenIds';

export function readSeenInAppNotificationIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(IN_APP_NOTIFICATION_POPUP_SEEN_KEY) || '[]') as unknown;
    return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

export function writeSeenInAppNotificationIds(ids: Set<string>) {
  localStorage.setItem(IN_APP_NOTIFICATION_POPUP_SEEN_KEY, JSON.stringify(Array.from(ids).slice(-200)));
}

export function notificationAlertSeverity(severity: string): 'info' | 'warning' | 'error' | 'success' {
  if (severity === 'warning' || severity === 'error' || severity === 'success') return severity;
  return 'info';
}

export function formatInAppNotificationWindow(item: SystemAnnouncementItem) {
  const start = item.startsAt ? new Date(item.startsAt).toLocaleString() : '现在';
  const end = item.endsAt ? new Date(item.endsAt).toLocaleString() : '长期有效';
  return `${start} - ${end}`;
}

type InAppNotificationState = {
  items: SystemAnnouncementItem[];
  setItems: (items: SystemAnnouncementItem[]) => void;
};

export const useInAppNotificationStore = create<InAppNotificationState>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
}));
