function normalizeBackendOrigin(value: string | undefined) {
  return (value || '').trim().replace(/\/+$/, '');
}

const BACKEND_ORIGIN = normalizeBackendOrigin(
  import.meta.env.VITE_BACKEND_ORIGIN || import.meta.env.VITE_API_BASE_URL,
);

export function getBackendOrigin() {
  return BACKEND_ORIGIN;
}

export function backendUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return BACKEND_ORIGIN ? `${BACKEND_ORIGIN}${normalizedPath}` : normalizedPath;
}
