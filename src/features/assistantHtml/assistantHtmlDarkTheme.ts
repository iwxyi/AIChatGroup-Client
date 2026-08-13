/*
 * Derived from Dark Reader's MIT-licensed color modification approach.
 * Source reference: darkreader 4.9.128, color modification functions.
 * This module contains only the static color conversion primitives needed by
 * the assistant HTML viewer; it does not include the browser extension runtime.
 */

export interface AssistantRgbColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
  a: number;
}

type ColorRole = 'background' | 'foreground' | 'border';

const DARK_BACKGROUND_POLE: HslColor = { h: 220, s: 0.16, l: 0.08, a: 1 };
const DARK_FOREGROUND_POLE: HslColor = { h: 210, s: 0.12, l: 0.92, a: 1 };
const MAX_BACKGROUND_LIGHTNESS = 0.4;
const MIN_FOREGROUND_LIGHTNESS = 0.55;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function scale(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number) {
  if (fromMax === fromMin) return toMin;
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
}

function rgbToHsl({ r: r255, g: g255, b: b255, a }: AssistantRgbColor): HslColor {
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const lightness = (max + min) / 2;
  if (chroma === 0) return { h: 0, s: 0, l: lightness, a };
  let hue = (max === r
    ? ((g - b) / chroma) % 6
    : max === g
      ? (b - r) / chroma + 2
      : (r - g) / chroma + 4) * 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: chroma / (1 - Math.abs(2 * lightness - 1)), l: lightness, a };
}

function hslToRgb({ h, s, l, a }: HslColor): AssistantRgbColor {
  if (s === 0) {
    const value = Math.round(l * 255);
    return { r: value, g: value, b: value, a };
  }
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r, g, b] = (h < 60
    ? [chroma, x, 0]
    : h < 120
      ? [x, chroma, 0]
      : h < 180
        ? [0, chroma, x]
        : h < 240
          ? [0, x, chroma]
          : h < 300
            ? [x, 0, chroma]
            : [chroma, 0, x]).map((value) => Math.round((value + m) * 255));
  return { r, g, b, a };
}

function isNeutral(hsl: HslColor) {
  return hsl.l < 0.2 || hsl.s < 0.24;
}

function modifyBackground(hsl: HslColor): HslColor {
  const isDark = hsl.l < 0.5;
  const isBlue = hsl.h > 200 && hsl.h < 280;
  const neutral = hsl.s < 0.12 || (hsl.l > 0.8 && isBlue);
  if (isDark) {
    const l = scale(hsl.l, 0, 0.5, 0, MAX_BACKGROUND_LIGHTNESS);
    return neutral ? { ...hsl, h: DARK_BACKGROUND_POLE.h, s: DARK_BACKGROUND_POLE.s, l } : { ...hsl, l };
  }
  let hue = hsl.h;
  if (neutral) {
    hue = DARK_BACKGROUND_POLE.h;
  } else if (hue > 60 && hue < 180) {
    hue = hue > 120 ? scale(hue, 120, 180, 135, 180) : scale(hue, 60, 120, 60, 105);
  }
  let lightness = scale(hsl.l, 0.5, 1, MAX_BACKGROUND_LIGHTNESS, DARK_BACKGROUND_POLE.l);
  if (hue > 40 && hue < 80) lightness *= 0.75;
  return { ...hsl, h: hue, s: neutral ? DARK_BACKGROUND_POLE.s : hsl.s, l: lightness };
}

function modifyForeground(hsl: HslColor): HslColor {
  const isLight = hsl.l > 0.5;
  const neutral = isNeutral(hsl);
  const isBlue = !neutral && hsl.h > 205 && hsl.h < 245;
  const hue = neutral ? DARK_FOREGROUND_POLE.h : isBlue ? scale(hsl.h, 205, 245, 205, 220) : hsl.h;
  const saturation = neutral ? DARK_FOREGROUND_POLE.s : hsl.s;
  const lightness = isLight
    ? scale(hsl.l, 0.5, 1, MIN_FOREGROUND_LIGHTNESS, DARK_FOREGROUND_POLE.l)
    : scale(hsl.l, 0, 0.5, DARK_FOREGROUND_POLE.l, Math.min(1, MIN_FOREGROUND_LIGHTNESS + 0.05));
  return { ...hsl, h: hue, s: saturation, l: lightness };
}

function modifyBorder(hsl: HslColor): HslColor {
  const neutral = isNeutral(hsl);
  const isDark = hsl.l < 0.5;
  return {
    ...hsl,
    h: neutral ? (isDark ? DARK_FOREGROUND_POLE.h : DARK_BACKGROUND_POLE.h) : hsl.h,
    s: neutral ? (isDark ? DARK_FOREGROUND_POLE.s : DARK_BACKGROUND_POLE.s) : hsl.s,
    l: scale(hsl.l, 0, 1, 0.5, 0.2),
  };
}

export function parseAssistantCssColor(value: string): AssistantRgbColor | null {
  const source = value.trim().toLowerCase();
  if (source === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = source.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const raw = hex[1];
    const expanded = raw.length <= 4 ? raw.split('').map((part) => part + part).join('') : raw;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }
  if (!source.startsWith('rgb')) return null;
  const values = source.match(/[0-9.]+/g);
  if (!values || values.length < 3) return null;
  return { r: Number(values[0]), g: Number(values[1]), b: Number(values[2]), a: values[3] === undefined ? 1 : Number(values[3]) };
}

export function modifyAssistantCssColor(value: string, role: ColorRole) {
  const rgb = parseAssistantCssColor(value);
  if (!rgb || rgb.a === 0) return null;
  const hsl = rgbToHsl(rgb);
  const modified = role === 'background' ? modifyBackground(hsl) : role === 'border' ? modifyBorder(hsl) : modifyForeground(hsl);
  const result = hslToRgb({ ...modified, a: rgb.a });
  const channels = [result.r, result.g, result.b].map((channel) => channel.toString(16).padStart(2, '0')).join('');
  return result.a < 1 ? `#${channels}${Math.round(result.a * 255).toString(16).padStart(2, '0')}` : `#${channels}`;
}

function colorRoleForProperty(property: string): ColorRole | null {
  if (property === 'color' || property === 'caret-color' || property === 'text-decoration-color' || property === 'column-rule-color') return 'foreground';
  if (property.includes('background') || property === 'fill') return 'background';
  if (property.includes('border') || property === 'outline-color' || property === 'stroke') return 'border';
  if (property === 'box-shadow' || property === 'text-shadow') return 'background';
  return null;
}

export function transformAssistantCssColors(css: string) {
  return css.replace(/([\w-]+)\s*:\s*([^;}{]+)/g, (declaration, property: string, value: string) => {
    const role = colorRoleForProperty(property.toLowerCase());
    if (!role) return declaration;
    const transformed = value.replace(/#[0-9a-f]{3,4}\b|#[0-9a-f]{6,8}\b|rgba?\([^)]*\)/gi, (token: string) => modifyAssistantCssColor(token, role) || token);
    return `${property}:${transformed}`;
  });
}

export function transformAssistantInlineStyles(html: string) {
  return html.replace(/(style\s*=\s*["'])([^"']+)(["'])/gi, (_, prefix: string, value: string, suffix: string) => `${prefix}${transformAssistantCssColors(value)}${suffix}`);
}
