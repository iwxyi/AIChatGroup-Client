import type { AssistantHtmlRuntimeManifest } from '../../types/assistantArtifact';
import { transformAssistantCssColors, transformAssistantInlineStyles } from './assistantHtmlDarkTheme';

function escapeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function stripUnsafeHtml(source: string) {
  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|base)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|base)\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|base)\b[^>]*\/?\s*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:src|href|action|formaction)\s*=\s*(?:"(?:https?:|\/\/|javascript:)[^"]*"|'(?:https?:|\/\/|javascript:)[^']*')/gi, '')
    .replace(/<input\b([^>]*?)type\s*=\s*["']?(?:file|password)["']?([^>]*)>/gi, '<input$1type="text" disabled$2>');
}

function bodyContent(source: string) {
  const withoutFence = source.trim().replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '');
  const bodyMatch = withoutFence.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  return stripUnsafeHtml(bodyMatch?.[1] || withoutFence);
}

function safeStyleContent(source: string) {
  return Array.from(source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi))
    .map((match) => match[1] || '')
    .join('\n')
    .replace(/@import[^;]+;/gi, '')
    .replace(/url\s*\(\s*["']?(?:https?:|\/\/)[^)]+\)/gi, 'none');
}

export function buildAssistantHtmlDocument(params: {
  html: string;
  manifest: AssistantHtmlRuntimeManifest;
  channelToken: string;
  artifactId: string;
  versionId: string;
  interactionState?: Record<string, unknown>;
  readOnly?: boolean;
  displayMode?: 'light' | 'dark';
}) {
  const hasNativeThemeContract = /--pneumata-(?:bg|surface|text|muted|border|accent)\s*:/iu.test(params.html)
    && /html\s*\[\s*data-pneumata-theme\s*=\s*["']light["']/iu.test(params.html)
    && /html\s*\[\s*data-pneumata-theme\s*=\s*["']dark["']/iu.test(params.html)
    && /prefers-color-scheme\s*:\s*dark/iu.test(params.html);
  const shouldConvertLegacyTheme = !hasNativeThemeContract && params.displayMode === 'dark';
  const nonce = params.channelToken.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const runtimeConfig = {
    channelToken: params.channelToken,
    artifactId: params.artifactId,
    versionId: params.versionId,
    interactionId: params.manifest.submission?.interactionId || '',
    fields: params.manifest.submission?.fields || [],
    initialState: params.interactionState || {},
    autosaveDebounceMs: params.manifest.autosave?.debounceMs || 900,
    readOnly: params.readOnly === true,
    displayMode: params.displayMode || 'light',
    hasNativeThemeContract,
  };
  const runtime = `(function(){
const config=${escapeScriptJson(runtimeConfig)};
const send=(type,payload)=>parent.postMessage({type,channelToken:config.channelToken,artifactId:config.artifactId,versionId:config.versionId,interactionId:config.interactionId,...payload},'*');
const controls=()=>Array.from(document.querySelectorAll('input[name],select[name],textarea[name]'));
const read=()=>{const result=Object.create(null);for(const field of config.fields){const nodes=controls().filter((node)=>node.name===field.name);if(field.type==='boolean'){result[field.name]=Boolean(nodes[0]&&nodes[0].checked);}else if(field.type==='multi_choice'){result[field.name]=nodes.filter((node)=>node.checked).map((node)=>node.value);}else if(nodes[0]){result[field.name]=nodes[0].value;}}return result;};
const restore=()=>{for(const field of config.fields){const value=config.initialState[field.name];for(const node of controls().filter((item)=>item.name===field.name)){if(field.type==='boolean'){node.checked=Boolean(value);}else if(field.type==='multi_choice'){node.checked=Array.isArray(value)&&value.includes(node.value);}else if(value!==undefined&&value!==null){node.value=String(value);}}}};
const applyDisplayMode=()=>{if(!config.hasNativeThemeContract)return;document.documentElement.style.colorScheme=config.displayMode;document.documentElement.setAttribute('data-pneumata-theme',config.displayMode);};
let timer=0;const autosave=()=>{clearTimeout(timer);timer=setTimeout(()=>send('autosave',{payload:read()}),config.autosaveDebounceMs);};
if(config.readOnly){for(const node of document.querySelectorAll('input,select,textarea,button'))node.disabled=true;}else{document.addEventListener('input',autosave);document.addEventListener('change',autosave);}
document.addEventListener('click',(event)=>{const target=event.target.closest('[data-pneumata-action]');if(!target)return;const action=target.getAttribute('data-pneumata-action');if(action==='open_fullscreen'){event.preventDefault();send('open_fullscreen',{});return;}if(config.readOnly)return;if(action==='save'){event.preventDefault();send('autosave',{payload:read()});}else if(action==='submit'){event.preventDefault();send('submit',{payload:read()});}else if(action==='close'){event.preventDefault();send('close',{});}else if(action==='reset'){event.preventDefault();for(const form of document.forms)form.reset();autosave();}});
document.addEventListener('submit',(event)=>{event.preventDefault();if(!config.readOnly)send('submit',{payload:read()});});
const report=()=>send('resize',{height:Math.min(Math.max(document.documentElement.scrollHeight,160),1600)});new ResizeObserver(report).observe(document.documentElement);
restore();applyDisplayMode();report();send('ready',{height:document.documentElement.scrollHeight});})();`;
  const styles = shouldConvertLegacyTheme ? transformAssistantCssColors(safeStyleContent(params.html)) : safeStyleContent(params.html);
  const displayStyles = hasNativeThemeContract && params.displayMode ? `html{color-scheme:${params.displayMode}}` : '';
  const body = bodyContent(params.html).replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  const transformedBody = shouldConvertLegacyTheme ? transformAssistantInlineStyles(body) : body;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; script-src 'nonce-${nonce}'; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"><style>html,body{margin:0;padding:0;background:transparent;color:#111827;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}button,input,select,textarea{font:inherit}${styles}${displayStyles}</style></head><body>${transformedBody}<script nonce="${nonce}">${runtime}</script></body></html>`;
}
