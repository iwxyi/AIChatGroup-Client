import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const allowedHosts = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean)
  : true
const appUpdateMode = process.env.VITE_APP_UPDATE_MODE === 'prompt' ? 'prompt' : 'auto'

function manualDevUpdatePlugin(): Plugin {
  let updateVersion = Date.now()

  const notifyClients = () => {
    updateVersion = Date.now()
  }

  return {
    name: 'pneumata-manual-dev-update',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__pneumata_dev_updates', (request, response, next) => {
        if (request.method !== 'GET') {
          next()
          return
        }
        const payload = JSON.stringify({ version: updateVersion })
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0',
          'Content-Length': Buffer.byteLength(payload),
        })
        response.end(payload)
      })

      server.watcher.on('change', notifyClients)
      server.watcher.on('add', notifyClients)
      server.watcher.on('unlink', notifyClients)
    },
  }
}

function isPublicAiProxyPath(pathname: string) {
  return pathname === '/ai'
    || pathname.startsWith('/ai/')
    || pathname === '/v1'
    || pathname.startsWith('/v1/')
    || pathname === '/models'
    || pathname.startsWith('/models/')
    || pathname === '/chat/completions'
    || pathname.startsWith('/chat/completions/')
    || pathname === '/responses'
    || pathname.startsWith('/responses/')
    || pathname === '/embeddings'
    || pathname.startsWith('/embeddings/')
    || pathname === '/images/generations'
    || pathname.startsWith('/images/generations/')
    || pathname === '/anthropic'
    || pathname.startsWith('/anthropic/')
    || pathname === '/web_search'
    || pathname.startsWith('/web_search/')
}

function publicAiProxyCorsPlugin(): Plugin {
  return {
    name: 'pneumata-public-ai-proxy-cors',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const origin = request.headers.origin
        const pathname = request.url ? new URL(request.url, 'http://localhost').pathname : ''
        if (!origin || !isPublicAiProxyPath(pathname)) {
          next()
          return
        }

        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Vary', 'Origin, Access-Control-Request-Headers')
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key,anthropic-version,anthropic-beta,openai-beta')
        if (request.method === 'OPTIONS') {
          response.statusCode = 204
          response.end()
          return
        }
        next()
      })
    },
  }
}

function setForwardedHeaders(proxyRequest: { setHeader(name: string, value: string): void }, request: { headers: Record<string, string | string[] | undefined> }) {
  const hostHeader = request.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) return;

  const forwardedProtoHeader = request.headers['x-forwarded-proto'];
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader;
  const proto = forwardedProto || 'http';

  proxyRequest.setHeader('x-forwarded-host', host);
  proxyRequest.setHeader('x-forwarded-proto', proto);
  const portMatch = host.match(/:(\d+)$/);
  if (portMatch?.[1]) proxyRequest.setHeader('x-forwarded-port', portMatch[1]);
}

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: false,
    hmr: appUpdateMode === 'auto',
    allowedHosts,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            setForwardedHeaders(proxyRequest, request)
          })
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['x-pneumata-vite-proxy'] = 'Pneumata-Client:5173';
          })
        },
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            setForwardedHeaders(proxyRequest, request)
          })
        },
      },
      '^/ai(?:/|$)': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            setForwardedHeaders(proxyRequest, request)
          })
        },
      },
      '^/v1(?:/|$)': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            setForwardedHeaders(proxyRequest, request)
          })
        },
      },
      '^/(models|responses|embeddings|chat/completions|images/generations|anthropic|web_search)(?:/|$)': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            setForwardedHeaders(proxyRequest, request)
          })
        },
      },
    },
  },
  plugins: [
    publicAiProxyCorsPlugin(),
    react(),
    manualDevUpdatePlugin(),
    VitePWA({
      registerType: appUpdateMode === 'prompt' ? 'prompt' : 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo-192.png', 'logo-512.png'],
      manifest: {
        name: 'Pneumata',
        short_name: 'Pneumata',
        description: 'AI Multi-Agent Social World Simulation Platform',
        theme_color: '#6750A4',
        background_color: '#FEF7FF',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'logo-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'logo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        clientsClaim: appUpdateMode === 'auto',
        skipWaiting: appUpdateMode === 'auto',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/uploads\/avatars\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'avatar-images',
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/api\.openai\.com\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@mui/x-charts')) return 'vendor-mui-charts'
            if (id.includes('@mui/icons-material')) return 'vendor-mui-icons'
            if (id.includes('@emotion/')) return 'vendor-emotion'
            if (id.includes('@mui/')) return 'vendor-mui-core'
            if (id.includes('react-router') || id.includes('@remix-run/')) return 'vendor-router'
            if (id.includes('react-i18next') || id.includes('i18next')) return 'vendor-i18n'
            if (id.includes('react/jsx-runtime') || id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react'
          }
        },
      },
    },
  },
})
