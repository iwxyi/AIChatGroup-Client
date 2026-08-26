import { useEffect, useState } from 'react';

export type ImageResourceAvailability = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * Checks a remote image before it is used as CSS background. Unlike an <img>,
 * CSS backgrounds have no error event, so failed media would otherwise leave
 * an indistinct empty surface.
 */
export function useImageResourceAvailability(url?: string | null): ImageResourceAvailability {
  const normalizedUrl = url?.trim() || '';
  const [status, setStatus] = useState<ImageResourceAvailability>(normalizedUrl ? 'loading' : 'idle');

  useEffect(() => {
    if (!normalizedUrl) {
      setStatus('idle');
      return undefined;
    }
    let active = true;
    setStatus('loading');
    const image = new Image();
    image.onload = () => { if (active) setStatus('ready'); };
    image.onerror = () => { if (active) setStatus('unavailable'); };
    image.src = normalizedUrl;
    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [normalizedUrl]);

  return status;
}
