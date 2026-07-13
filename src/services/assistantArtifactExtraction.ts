import type { AssistantArtifactDraft, AssistantArtifactKind } from '../types/assistantArtifact';

interface CodeFence {
  language: string;
  content: string;
}

const MAX_TITLE_LENGTH = 42;
const MAX_SUMMARY_LENGTH = 96;
const MAX_ARTIFACTS_PER_MESSAGE = 8;

const DIAGRAM_LANGUAGES = new Set(['mermaid', 'plantuml', 'dot', 'graphviz']);
const DOCUMENT_LANGUAGES = new Set(['markdown', 'md', 'mdx']);
const JSON_LANGUAGES = new Set(['json', 'jsonc']);
const TABLE_LANGUAGES = new Set(['csv', 'tsv']);
const HTML_LANGUAGES = new Set(['html', 'htm']);

const CODE_LANGUAGES = new Set([
  'js', 'javascript', 'jsx', 'ts', 'typescript', 'tsx', 'css', 'scss', 'less', 'python', 'py', 'java', 'kotlin', 'swift',
  'go', 'rust', 'rs', 'c', 'cpp', 'c++', 'csharp', 'cs', 'php', 'ruby', 'rb', 'shell', 'bash', 'sh', 'zsh', 'sql',
  'yaml', 'yml', 'toml', 'xml', 'dockerfile', 'vue', 'svelte',
]);

function cleanTitle(value: string, fallback: string) {
  const normalized = value
    .replace(/[`*_#[\]()>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (normalized || fallback).slice(0, MAX_TITLE_LENGTH);
}

function summarize(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#>*_`|\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SUMMARY_LENGTH);
}

function getMarkdownHeading(text: string) {
  const heading = text.match(/^\s{0,3}#{1,3}\s+(.+)$/m)?.[1];
  if (heading) return cleanTitle(heading, 'Markdown 文档');
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return cleanTitle(firstLine || '', 'Markdown 文档');
}

function extractFences(content: string): CodeFence[] {
  const fences: CodeFence[] = [];
  const pattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const language = match[1].trim().split(/\s+/)[0].toLowerCase();
    const body = match[2].trim();
    if (!body) continue;
    fences.push({ language, content: body });
  }
  return fences;
}

function inferFenceKind(language: string, content: string): AssistantArtifactKind {
  if (DIAGRAM_LANGUAGES.has(language)) return 'diagram';
  if (HTML_LANGUAGES.has(language)) return 'html';
  if (JSON_LANGUAGES.has(language)) return 'json';
  if (TABLE_LANGUAGES.has(language)) return 'table';
  if (DOCUMENT_LANGUAGES.has(language)) return 'document';
  if (CODE_LANGUAGES.has(language)) return 'code';
  if (/^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|mindmap)\b/m.test(content)) return 'diagram';
  if (/^\s*</.test(content) && /<\/(html|body|div|section|main|table|svg)>/i.test(content)) return 'html';
  if (/^\s*[\[{]/.test(content)) return 'json';
  return language ? 'code' : 'text';
}

function titleForFence(kind: AssistantArtifactKind, language: string, content: string, index: number) {
  if (kind === 'diagram') return cleanTitle(`${language || 'Mermaid'} 图表`, '图表产物');
  if (kind === 'html') return 'HTML 页面';
  if (kind === 'json') return 'JSON 数据';
  if (kind === 'table') return `${language.toUpperCase()} 表格`;
  if (kind === 'document') return getMarkdownHeading(content);
  if (kind === 'code') return cleanTitle(`${language || '代码'} 片段`, '代码产物');
  return cleanTitle(`文本片段 ${index + 1}`, '文本产物');
}

function hasMarkdownDocumentShape(content: string) {
  const withoutFences = content.replace(/```[\s\S]*?```/g, '').trim();
  if (withoutFences.length < 160) return false;
  return /^\s{0,3}#{1,3}\s+\S/m.test(withoutFences)
    || /\n\s{0,3}[-*+]\s+\S/.test(withoutFences)
    || /\n\s*\|.+\|\s*\n\s*\|\s*[-:]+/.test(withoutFences);
}

function extractMarkdownDocument(content: string): AssistantArtifactDraft | null {
  if (!hasMarkdownDocumentShape(content)) return null;
  return {
    kind: 'document',
    title: getMarkdownHeading(content),
    content: content.trim(),
    language: 'markdown',
    summary: summarize(content),
  };
}

function isDuplicateDraft(left: AssistantArtifactDraft, right: AssistantArtifactDraft) {
  return left.kind === right.kind && left.language === right.language && left.content.trim() === right.content.trim();
}

export function extractAssistantArtifactsFromMessage(content: string): AssistantArtifactDraft[] {
  const drafts: AssistantArtifactDraft[] = [];
  const fences = extractFences(content);
  fences.forEach((fence, index) => {
    const kind = inferFenceKind(fence.language, fence.content);
    if (kind === 'text' && fence.content.length < 180) return;
    drafts.push({
      kind,
      title: titleForFence(kind, fence.language, fence.content, index),
      content: fence.content,
      language: fence.language || (kind === 'diagram' ? 'mermaid' : null),
      summary: summarize(fence.content),
    });
  });

  const markdownDocument = extractMarkdownDocument(content);
  if (markdownDocument && !drafts.some((draft) => isDuplicateDraft(draft, markdownDocument))) {
    drafts.unshift(markdownDocument);
  }

  return drafts
    .filter((draft, index, items) => items.findIndex((item) => isDuplicateDraft(item, draft)) === index)
    .slice(0, MAX_ARTIFACTS_PER_MESSAGE);
}
