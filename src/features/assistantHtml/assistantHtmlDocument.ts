import type { AssistantHtmlRuntimeManifest } from '../../types/assistantArtifact';

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
const parseColor=(value)=>{const source=String(value||'').trim().toLowerCase();if(!source.startsWith('rgb'))return null;const values=source.match(/[0-9.]+/g);if(!values||values.length<3)return null;return{r:Number(values[0]),g:Number(values[1]),b:Number(values[2]),a:values[3]===undefined?1:Number(values[3])};};
const neutral=(color)=>color&&color.a>0&&Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b)<=10;
const luminance=(color)=>(color.r+color.g+color.b)/3;
const gray=(value,alpha=1)=>alpha<1?'rgb('+value+' '+value+' '+value+' / '+alpha+')':'rgb('+value+' '+value+' '+value+')';
const darkBackground=(color)=>gray(Math.round(Math.max(0,255-luminance(color))*0.14),color.a);
const darkForeground=(color)=>gray(245,color.a);
const darkBorder=(color)=>gray(Math.round(48+Math.max(0,255-luminance(color))*0.12),color.a);
const rgbToHsl=(color)=>{const r=color.r/255,g=color.g/255,b=color.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;let h=0;const l=(max+min)/2;if(delta){if(max===r)h=((g-b)/delta)%6;else if(max===g)h=(b-r)/delta+2;else h=(r-g)/delta+4;h*=60;if(h<0)h+=360;}const s=delta===0?0:delta/(1-Math.abs(2*l-1));return{h,s,l,a:color.a};};
const hslToColor=(hsl)=>{const c=(1-Math.abs(2*hsl.l-1))*hsl.s,x=c*(1-Math.abs((hsl.h/60)%2-1)),m=hsl.l-c/2;let r=0,g=0,b=0;if(hsl.h<60){r=c;g=x;}else if(hsl.h<120){r=x;g=c;}else if(hsl.h<180){g=c;b=x;}else if(hsl.h<240){g=x;b=c;}else if(hsl.h<300){r=x;b=c;}else{r=c;b=x;}const values=[r,g,b].map((value)=>Math.round((value+m)*255));return hsl.a<1?'rgba('+values.join(' ' )+' / '+hsl.a+')':'rgb('+values.join(' ')+')';};
const coloredForeground=(color)=>{const hsl=rgbToHsl(color);hsl.l=Math.max(hsl.l,0.72);return hslToColor(hsl);};
const coloredBackground=(color)=>{const hsl=rgbToHsl(color);const originalLightness=hsl.l;hsl.l=Math.max(0.14,Math.min(0.3,0.14+(1-originalLightness)*0.22));if(originalLightness>0.68)hsl.s*=0.58;return hslToColor(hsl);};
const coloredBorder=(color)=>{const hsl=rgbToHsl(color);hsl.l=Math.min(Math.max(hsl.l,0.42),0.58);return hslToColor(hsl);};
const setViewerColor=(node,property,value)=>node.style.setProperty(property,value,'important');
const applyDisplayMode=()=>{const dark=config.displayMode==='dark';document.documentElement.style.colorScheme=dark?'dark':'light';document.documentElement.setAttribute('data-pneumata-theme',config.displayMode);if(config.hasNativeThemeContract||!dark)return;for(const node of document.querySelectorAll('body,body *')){if(node.matches('img,picture,video,canvas'))continue;const style=getComputedStyle(node);const background=parseColor(style.backgroundColor);const foreground=parseColor(style.color);const border=parseColor(style.borderTopColor);if(background&&background.a>0)setViewerColor(node,'background-color',neutral(background)?darkBackground(background):coloredBackground(background));if(foreground&&foreground.a>0&&(!background||background.a===0||neutral(background)))setViewerColor(node,'color',neutral(foreground)?darkForeground(foreground):coloredForeground(foreground));if(border&&border.a>0)setViewerColor(node,'border-color',neutral(border)?darkBorder(border):coloredBorder(border));}};
let timer=0;const autosave=()=>{clearTimeout(timer);timer=setTimeout(()=>send('autosave',{payload:read()}),config.autosaveDebounceMs);};
if(config.readOnly){for(const node of document.querySelectorAll('input,select,textarea,button'))node.disabled=true;}else{document.addEventListener('input',autosave);document.addEventListener('change',autosave);}
document.addEventListener('click',(event)=>{const target=event.target.closest('[data-pneumata-action]');if(!target)return;const action=target.getAttribute('data-pneumata-action');if(action==='open_fullscreen'){event.preventDefault();send('open_fullscreen',{});return;}if(config.readOnly)return;if(action==='save'){event.preventDefault();send('autosave',{payload:read()});}else if(action==='submit'){event.preventDefault();send('submit',{payload:read()});}else if(action==='close'){event.preventDefault();send('close',{});}else if(action==='reset'){event.preventDefault();for(const form of document.forms)form.reset();autosave();}});
document.addEventListener('submit',(event)=>{event.preventDefault();if(!config.readOnly)send('submit',{payload:read()});});
const report=()=>send('resize',{height:Math.min(Math.max(document.documentElement.scrollHeight,160),1600)});new ResizeObserver(report).observe(document.documentElement);
restore();applyDisplayMode();report();send('ready',{height:document.documentElement.scrollHeight});})();`;
  const styles = safeStyleContent(params.html);
  const displayStyles = params.displayMode ? `html{color-scheme:${params.displayMode}}` : '';
  const body = bodyContent(params.html).replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; script-src 'nonce-${nonce}'; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"><style>html,body{margin:0;padding:0;background:transparent;color:#111827;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}button,input,select,textarea{font:inherit}${styles}${displayStyles}</style></head><body>${body}<script nonce="${nonce}">${runtime}</script></body></html>`;
}
