import { Alert, Box, Button, LinearProgress, Stack } from '@mui/material';

function cleanAdminErrorMessage(message: string) {
  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();
  if (normalized.includes('<!doctype') || normalized.includes('<html') || normalized.includes('<title>')) {
    const statusMatch = trimmed.match(/\b(?:HTTP\s*)?([45]\d{2})\b/i);
    const statusText = statusMatch ? `（HTTP ${statusMatch[1]}）` : '';
    if (normalized.includes('cloudflare') || normalized.includes('attention required')) {
      return `上游服务被 Cloudflare 拦截，请检查服务器出口 IP 或服务商访问限制${statusText}`;
    }
    return `后台接口返回了 HTML 页面，请检查后端服务或开发代理配置${statusText}`;
  }
  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;
}

export function getAdminErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return cleanAdminErrorMessage(error.message);
  if (typeof error === 'string' && error.trim()) return cleanAdminErrorMessage(error);
  return '请求失败，请稍后重试';
}

export default function AdminRequestState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  return (
    <Stack spacing={1}>
      <Box sx={{ height: 4, borderRadius: 999, overflow: 'hidden' }}>
        {loading ? <LinearProgress sx={{ height: '100%' }} /> : null}
      </Box>
      {error ? (
        <Alert
          severity="error"
          action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>重试</Button> : undefined}
        >
          {error}
        </Alert>
      ) : null}
    </Stack>
  );
}
