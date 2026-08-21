import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';

export function useVoicePlayback(options: {
  src?: string | null;
  initialDurationMs?: number;
  estimatedDurationMs?: number;
  onError?: (message: string) => void;
}) {
  const onError = options.onError;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(options.initialDurationMs || 0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const effectiveDurationMs = durationMs || options.estimatedDurationMs || 0;
  const progress = effectiveDurationMs > 0 ? Math.max(0, Math.min(1, currentTimeMs / effectiveDurationMs)) : 0;

  const clearWaitingTimer = useCallback(() => {
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
  }, []);

  const fail = useCallback((message: string) => {
    clearWaitingTimer();
    setPlaying(false);
    setPlaybackError(message);
    onError?.(message);
  }, [clearWaitingTimer, onError]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaybackError(null);
    if (audio.paused) {
      try {
        if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) audio.load();
        waitingTimerRef.current = setTimeout(() => fail('语音资源读取超时，请检查媒体地址或重新生成'), 6000);
        await audio.play();
      } catch (error) {
        fail(error instanceof Error ? error.message : '语音暂时无法播放');
      }
    } else {
      clearWaitingTimer();
      audio.pause();
    }
  }, [clearWaitingTimer, fail]);

  const seek = useCallback((clientX: number, element: HTMLElement | null) => {
    const audio = audioRef.current;
    if (!audio?.duration || !element) return;
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTimeMs(Math.round(audio.currentTime * 1000));
  }, []);

  const audioProps = {
    ref: audioRef,
    src: options.src || undefined,
    preload: 'metadata' as const,
    onPlay: () => { clearWaitingTimer(); setPlaying(true); },
    onPlaying: () => { clearWaitingTimer(); setPlaying(true); setPlaybackError(null); },
    onWaiting: (event: SyntheticEvent<HTMLAudioElement>) => {
      clearWaitingTimer();
      waitingTimerRef.current = setTimeout(() => fail('语音资源读取超时，请检查媒体地址或重新生成'), 6000);
    },
    onPause: () => { clearWaitingTimer(); setPlaying(false); },
    onTimeUpdate: (event: SyntheticEvent<HTMLAudioElement>) => {
      setCurrentTimeMs(Math.round(Math.max(0, event.currentTarget.currentTime) * 1000));
    },
    onEnded: (event: SyntheticEvent<HTMLAudioElement>) => {
      clearWaitingTimer();
      setPlaying(false);
      event.currentTarget.currentTime = 0;
      setCurrentTimeMs(0);
    },
    onError: () => { fail('语音文件暂时无法读取，请重新生成'); },
    onLoadedMetadata: (event: SyntheticEvent<HTMLAudioElement>) => {
      const seconds = event.currentTarget.duration;
      if (Number.isFinite(seconds) && seconds > 0) {
        setDurationMs(Math.round(seconds * 1000));
        setCurrentTimeMs(Math.round(event.currentTarget.currentTime * 1000));
      }
    },
  };

  useEffect(() => {
    if (!playing) return undefined;
    let frameId = 0;
    const sync = () => {
      const audio = audioRef.current;
      if (audio) {
        const current = Math.max(0, audio.currentTime || 0);
        const actualDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        if (actualDuration > 0) setDurationMs(Math.round(actualDuration * 1000));
        setCurrentTimeMs(Math.round(current * 1000));
      }
    };
    const update = () => {
      sync();
      frameId = window.requestAnimationFrame(update);
    };
    sync();
    frameId = window.requestAnimationFrame(update);
    const interval = window.setInterval(sync, 100);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(interval);
    };
  }, [playing]);

  useEffect(() => () => clearWaitingTimer(), [clearWaitingTimer]);

  return {
    audioRef,
    audioProps,
    playing,
    durationMs: effectiveDurationMs,
    currentTimeMs,
    remainingDurationMs: Math.max(0, effectiveDurationMs - currentTimeMs),
    progress,
    playbackError,
    toggle,
    seek,
  };
}
