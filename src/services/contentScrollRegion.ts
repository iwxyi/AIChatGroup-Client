export const CONTENT_SCROLL_TO_TOP_EVENT = 'pneumata:content-scroll-to-top';

export interface ContentScrollToTopDetail {
  preserveHeader?: boolean;
}

export function requestNearestContentScrollToTop(source: Element | null, detail: ContentScrollToTopDetail = {}) {
  const region = source?.closest<HTMLElement>('[data-pneumata-scroll-region]');
  if (!region) return;
  region.dispatchEvent(new CustomEvent<ContentScrollToTopDetail>(CONTENT_SCROLL_TO_TOP_EVENT, {
    detail: { preserveHeader: false, ...detail },
  }));
}
