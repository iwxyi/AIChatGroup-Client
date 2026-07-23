import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import { registerSW } from 'virtual:pwa-register';
import AppSnackbar from './AppSnackbar';

const UPDATE_MODE = import.meta.env.VITE_APP_UPDATE_MODE === 'prompt' ? 'prompt' : 'auto';

export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateSWRef = useRef<ReturnType<typeof registerSW> | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) {
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations()
          .then((registrations) => {
            registrations.forEach((registration) => {
              void registration.unregister();
            });
          })
          .catch((error) => {
            console.warn('Failed to unregister service workers in dev mode:', error);
          });
      }
      return;
    }
    updateSWRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        if (UPDATE_MODE === 'auto') {
          void updateSWRef.current?.(true);
          return;
        }
        setNeedRefresh(true);
      },
    });
  }, []);

  const handleRefresh = () => {
    void updateSWRef.current?.(true);
  };

  if (import.meta.env.DEV || UPDATE_MODE === 'auto') return null;

  return (
    <AppSnackbar
      open={needRefresh}
      message="页面已更新，刷新后生效"
      severity="info"
      autoHideDuration={null}
      onClose={() => setNeedRefresh(false)}
      offset="none"
      action={
        <Button color="inherit" size="small" onClick={handleRefresh}>
          刷新
        </Button>
      }
    />
  );
}
