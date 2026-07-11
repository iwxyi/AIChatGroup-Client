import { api, type CaptchaPublicConfig } from './api';

type TurnstileRenderOptions = {
  sitekey: string;
  size: 'invisible';
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

type HCaptchaApi = TurnstileApi;

type TencentCaptchaInstance = {
  show: () => void;
  destroy?: () => void;
};

type TencentCaptchaConstructor = new (
  appId: string,
  callback: (result: { ret: number; ticket?: string; randstr?: string }) => void,
  options?: Record<string, unknown>,
) => TencentCaptchaInstance;

type GeetestInstance = {
  showCaptcha: () => void;
  getValidate: () => Record<string, unknown>;
  onReady: (callback: () => void) => GeetestInstance;
  onSuccess: (callback: () => void) => GeetestInstance;
  onError: (callback: () => void) => GeetestInstance;
  destroy?: () => void;
};

type YidunInstance = {
  popUp: () => void;
  destroy?: () => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    hcaptcha?: HCaptchaApi;
    TencentCaptcha?: TencentCaptchaConstructor;
    initGeetest4?: (config: Record<string, unknown>, callback: (captcha: GeetestInstance) => void) => void;
    initNECaptcha?: (
      config: Record<string, unknown>,
      onReady: (instance: YidunInstance) => void,
      onError?: (error: unknown) => void,
    ) => void;
  }
}

let configPromise: Promise<CaptchaPublicConfig> | null = null;
const scriptPromises = new Map<string, Promise<void>>();
const LOCAL_CAPTCHA_ALLOWED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LOCAL_CAPTCHA_ALLOWED_CHAR_SET = new Set(LOCAL_CAPTCHA_ALLOWED_CHARS.split(''));

async function getCaptchaConfig() {
  if (!configPromise) {
    configPromise = api.getPlatformPublicConfig().then((result) => result.captcha || { enabled: false, provider: 'turnstile', siteKey: '' });
  }
  return configPromise;
}

function loadScript(key: string, src: string, ready: () => boolean) {
  if (ready()) return Promise.resolve();
  const current = scriptPromises.get(key);
  if (current) return current;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-pneumata-captcha="${key}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('人机校验加载失败，请刷新后重试')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.pneumataCaptcha = key;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('人机校验加载失败，请刷新后重试'));
    document.head.appendChild(script);
  });
  scriptPromises.set(key, promise);
  return promise;
}

function ensureCaptchaContainer() {
  let container = document.getElementById('pneumata-captcha-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pneumata-captcha-root';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.bottom = '0';
    container.style.width = '1px';
    container.style.height = '1px';
    container.style.overflow = 'hidden';
    document.body.appendChild(container);
  }
  return container;
}

function executeInvisibleSiteVerifyCaptcha(apiName: 'turnstile' | 'hcaptcha', siteKey: string) {
  return new Promise<string>((resolve, reject) => {
    const api = apiName === 'turnstile' ? window.turnstile : window.hcaptcha;
    if (!api) {
      reject(new Error('人机校验加载失败，请刷新后重试'));
      return;
    }
    const container = ensureCaptchaContainer();
    let settled = false;
    let widgetId = '';
    const cleanup = () => {
      if (!widgetId) return;
      try {
        api.remove(widgetId);
      } catch {
        // Widget may already be gone after a browser-side challenge failure.
      }
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const timeout = window.setTimeout(() => fail('人机校验超时，请重试'), 30_000);
    widgetId = api.render(container, {
      sitekey: siteKey,
      size: 'invisible',
      callback: (token) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        cleanup();
        resolve(token);
      },
      'error-callback': () => {
        window.clearTimeout(timeout);
        fail('人机校验失败，请重试');
      },
      'expired-callback': () => {
        window.clearTimeout(timeout);
        fail('人机校验已过期，请重试');
      },
    });
    api.execute(widgetId);
  });
}

async function executeTencentCaptcha(siteKey: string) {
  await loadScript('tencentcloud', 'https://turing.captcha.qcloud.com/TCaptcha.js', () => Boolean(window.TencentCaptcha));
  if (!window.TencentCaptcha) throw new Error('人机校验加载失败，请刷新后重试');
  const TencentCaptcha = window.TencentCaptcha;
  return new Promise<string>((resolve, reject) => {
    let captcha: TencentCaptchaInstance | null = null;
    const timeout = window.setTimeout(() => {
      captcha?.destroy?.();
      reject(new Error('人机校验超时，请重试'));
    }, 60_000);
    captcha = new TencentCaptcha(siteKey, (result) => {
      window.clearTimeout(timeout);
      captcha?.destroy?.();
      if (result.ret !== 0 || !result.ticket || !result.randstr) {
        reject(new Error('人机校验失败，请重试'));
        return;
      }
      resolve(JSON.stringify({ ticket: result.ticket, randstr: result.randstr }));
    });
    captcha.show();
  });
}

async function executeGeetestV4Captcha(siteKey: string) {
  await loadScript('geetest-v4', 'https://static.geetest.com/v4/gt4.js', () => Boolean(window.initGeetest4));
  if (!window.initGeetest4) throw new Error('人机校验加载失败，请刷新后重试');
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let instance: GeetestInstance | null = null;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
      instance?.destroy?.();
    };
    const timeout = window.setTimeout(() => finish(() => reject(new Error('人机校验超时，请重试'))), 60_000);
    window.initGeetest4?.({ captchaId: siteKey, product: 'bind' }, (captcha) => {
      instance = captcha;
      captcha
        .onReady(() => captcha.showCaptcha())
        .onSuccess(() => finish(() => resolve(JSON.stringify(captcha.getValidate()))))
        .onError(() => finish(() => reject(new Error('人机校验失败，请重试'))));
    });
  });
}

async function executeYidunCaptcha(siteKey: string) {
  await loadScript('yidun', 'https://cstaticdun.126.net/load.min.js', () => Boolean(window.initNECaptcha));
  if (!window.initNECaptcha) throw new Error('人机校验加载失败，请刷新后重试');
  return new Promise<string>((resolve, reject) => {
    let instance: YidunInstance | null = null;
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
      instance?.destroy?.();
    };
    const timeout = window.setTimeout(() => finish(() => reject(new Error('人机校验超时，请重试'))), 60_000);
    window.initNECaptcha?.({
      captchaId: siteKey,
      mode: 'popup',
      width: '320px',
      onVerify: (error: unknown, data: { validate?: string } = {}) => {
        if (error || !data.validate) {
          finish(() => reject(new Error('人机校验失败，请重试')));
          return;
        }
        finish(() => resolve(JSON.stringify({ validate: data.validate })));
      },
    }, (captcha) => {
      instance = captcha;
      captcha.popUp();
    }, () => finish(() => reject(new Error('人机校验加载失败，请刷新后重试'))));
  });
}

async function executeLocalCaptcha() {
  const challenge = await api.createLocalCaptchaChallenge();
  return new Promise<string>((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '20px';
    overlay.style.background = 'rgba(15, 23, 42, 0.45)';

    const dialog = document.createElement('form');
    dialog.style.width = 'min(360px, 100%)';
    dialog.style.borderRadius = '12px';
    dialog.style.padding = '20px';
    dialog.style.background = '#fff';
    dialog.style.boxShadow = '0 24px 60px rgba(15, 23, 42, 0.24)';
    dialog.style.display = 'grid';
    dialog.style.gap = '14px';

    const title = document.createElement('div');
    title.textContent = '请输入图片验证码';
    title.style.fontSize = '17px';
    title.style.fontWeight = '700';
    title.style.color = '#111827';

    const image = document.createElement('img');
    image.alt = '图片验证码';
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(challenge.imageSvg)}`;
    image.style.width = '150px';
    image.style.height = '48px';
    image.style.border = '1px solid #d1d5db';
    image.style.borderRadius = '8px';
    image.style.background = '#f8fafc';

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.inputMode = 'text';
    input.autocapitalize = 'characters';
    input.lang = 'en';
    input.pattern = `[${LOCAL_CAPTCHA_ALLOWED_CHARS}a-z]+`;
    input.spellcheck = false;
    input.maxLength = 5;
    input.placeholder = '输入上方字符，不区分大小写';
    input.style.height = '42px';
    input.style.border = '1px solid #d1d5db';
    input.style.borderRadius = '8px';
    input.style.padding = '0 12px';
    input.style.fontSize = '16px';
    input.style.outline = 'none';

    const hint = document.createElement('div');
    hint.textContent = '仅支持英文字母和数字，不区分大小写；验证码字体已做高对比区分。';
    hint.style.marginTop = '-8px';
    hint.style.fontSize = '12px';
    hint.style.lineHeight = '1.5';
    hint.style.color = '#64748b';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '10px';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    cancel.style.height = '38px';
    cancel.style.padding = '0 14px';
    cancel.style.border = '1px solid #d1d5db';
    cancel.style.borderRadius = '8px';
    cancel.style.background = '#fff';
    cancel.style.cursor = 'pointer';

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '确认';
    submit.style.height = '38px';
    submit.style.padding = '0 16px';
    submit.style.border = '0';
    submit.style.borderRadius = '8px';
    submit.style.background = '#2563eb';
    submit.style.color = '#fff';
    submit.style.cursor = 'pointer';

    const cleanup = () => {
      document.removeEventListener('keydown', handleEscape);
      overlay.remove();
    };
    const fail = () => {
      cleanup();
      reject(new Error('请先完成人机校验'));
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') fail();
    };
    const normalizeLocalCaptchaInput = (value: string) => value
      .toUpperCase()
      .split('')
      .filter((char) => LOCAL_CAPTCHA_ALLOWED_CHAR_SET.has(char))
      .join('')
      .slice(0, 5);

    cancel.addEventListener('click', fail);
    input.addEventListener('beforeinput', (event) => {
      const data = event instanceof InputEvent ? event.data : null;
      if (!data) return;
      if (normalizeLocalCaptchaInput(data) !== data.toUpperCase()) event.preventDefault();
    });
    input.addEventListener('input', () => {
      const normalized = normalizeLocalCaptchaInput(input.value);
      if (input.value !== normalized) input.value = normalized;
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) fail();
    });
    dialog.addEventListener('submit', (event) => {
      event.preventDefault();
      const answer = input.value.trim();
      if (!answer) {
        input.focus();
        return;
      }
      cleanup();
      resolve(JSON.stringify({ challengeId: challenge.challengeId, answer }));
    });
    document.addEventListener('keydown', handleEscape);

    actions.append(cancel, submit);
    dialog.append(title, image, input, hint, actions);
    overlay.append(dialog);
    document.body.appendChild(overlay);
    input.focus();
  });
}

export async function getSmsCaptchaToken() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  const config = await getCaptchaConfig();
  if (!config.enabled) return undefined;
  if (config.provider === 'local') return executeLocalCaptcha();
  if (!config.siteKey) throw new Error('人机校验配置不可用，请联系管理员');

  if (config.provider === 'turnstile') {
    await loadScript('turnstile', 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', () => Boolean(window.turnstile));
    return executeInvisibleSiteVerifyCaptcha('turnstile', config.siteKey);
  }
  if (config.provider === 'hcaptcha') {
    await loadScript('hcaptcha', 'https://js.hcaptcha.com/1/api.js?render=explicit', () => Boolean(window.hcaptcha));
    return executeInvisibleSiteVerifyCaptcha('hcaptcha', config.siteKey);
  }
  if (config.provider === 'tencentcloud') return executeTencentCaptcha(config.siteKey);
  if (config.provider === 'geetest-v4') return executeGeetestV4Captcha(config.siteKey);
  if (config.provider === 'yidun') return executeYidunCaptcha(config.siteKey);

  throw new Error(`暂不支持的人机校验服务：${config.provider}`);
}
