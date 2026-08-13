import type { AssistantArtifactDataOperation, AssistantArtifactDataResult, AssistantArtifactItem, AssistantArtifactVersion, AssistantDataFilter } from '../types/assistantArtifact';
export type AssistantDataFormat = 'csv' | 'json';

const MAX_RESULT_ROWS = 100;

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += character;
  }
  cells.push(cell);
  return cells;
}

function csvEscape(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(content: string) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line, index, all) => line.length || index < all.length - 1);
  if (!lines.length || !lines[0]) return { columns: [] as string[], rows: [] as Array<Record<string, unknown>> };
  const columns = parseCsvLine(lines[0]).map((column, index) => column.trim() || `column_${index + 1}`);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
  });
  return { columns, rows };
}

function stringifyCsv(columns: string[], rows: Array<Record<string, unknown>>) {
  return [columns.map(csvEscape).join(','), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))].join('\n');
}

function parseJsonRecords(content: string) {
  const parsed = JSON.parse(content) as unknown;
  if (Array.isArray(parsed)) {
    return { container: 'array' as const, rows: parsed.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row))) };
  }
  if (parsed && typeof parsed === 'object') return { container: 'object' as const, rows: [parsed as Record<string, unknown>] };
  throw new Error('JSON 必须是对象或对象数组');
}

function matches(row: Record<string, unknown>, filters: AssistantDataFilter[] = []) {
  return filters.every((filter) => {
    const actual = row[filter.field];
    const expected = filter.value;
    const operator = filter.operator || 'eq';
    if (operator === 'contains') return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    if (operator === 'startsWith') return String(actual ?? '').toLowerCase().startsWith(String(expected ?? '').toLowerCase());
    if (operator === 'endsWith') return String(actual ?? '').toLowerCase().endsWith(String(expected ?? '').toLowerCase());
    const actualNumber = Number(actual);
    const expectedNumber = Number(expected);
    const actualDate = Date.parse(String(actual ?? ''));
    const expectedDate = Date.parse(String(expected ?? ''));
    const left = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) ? actualNumber : actualDate;
    const right = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) ? expectedNumber : expectedDate;
    if (operator === 'gt') return Number.isFinite(left) && Number.isFinite(right) && left > right;
    if (operator === 'gte') return Number.isFinite(left) && Number.isFinite(right) && left >= right;
    if (operator === 'lt') return Number.isFinite(left) && Number.isFinite(right) && left < right;
    if (operator === 'lte') return Number.isFinite(left) && Number.isFinite(right) && left <= right;
    return String(actual ?? '') === String(expected ?? '');
  });
}

function resolveContent(version: AssistantArtifactVersion, filePath?: string | null) {
  if (filePath) {
    const file = version.files?.find((entry) => entry.path === filePath);
    if (!file) throw new Error(`找不到文件: ${filePath}`);
    return { content: file.content, filePath };
  }
  if (version.files?.length === 1) return { content: version.files[0].content, filePath: version.files[0].path };
  if (version.files?.length) throw new Error('多文件产物必须指定 filePath');
  return { content: version.content, filePath: null };
}

export function summarizeAssistantArtifactData(item: AssistantArtifactItem) {
  const version = item.versions.find((entry) => entry.id === item.currentVersionId) || item.versions.at(-1);
  if (!version) return null;
  try {
    const format: AssistantDataFormat = item.kind === 'json' || /\.json$/i.test(version.files?.[0]?.path || '') ? 'json' : 'csv';
    const source = resolveContent(version, version.files?.length === 1 ? version.files[0].path : null).content;
    const parsed = format === 'csv' ? parseCsv(source) : parseJsonRecords(source);
    const rows = parsed.rows;
    const columns = format === 'csv' && 'columns' in parsed ? parsed.columns : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    return { format, rowCount: rows.length, columns: columns.slice(0, 80), sampleRows: rows.slice(0, 5), sizeBytes: source.length };
  } catch {
    return { format: item.kind === 'json' ? 'json' : 'csv' as AssistantDataFormat, rowCount: 0, columns: [], sampleRows: [], sizeBytes: version.content.length, parseError: true };
  }
}

export function applyAssistantArtifactDataOperation(item: AssistantArtifactItem, operation: AssistantArtifactDataOperation, timestamp: number) {
  const version = item.versions.find((entry) => entry.id === item.currentVersionId) || item.versions.at(-1);
  if (!version) return { item, result: { operation: operation.kind, affectedRows: 0, error: '产物没有可用版本' } satisfies AssistantArtifactDataResult };
  try {
    const resolved = resolveContent(version, operation.filePath);
    const format: AssistantDataFormat = item.kind === 'json' || /\.json$/i.test(resolved.filePath || '') ? 'json' : 'csv';
    const parsed = format === 'csv' ? parseCsv(resolved.content) : parseJsonRecords(resolved.content);
    let rows = [...parsed.rows];
    const matched = rows.filter((row) => matches(row, operation.filter));
    let affectedRows = 0;
    if (operation.kind === 'query') {
      const sorted = operation.sort ? [...matched].sort((left, right) => {
        const a = left[operation.sort!.field];
        const b = right[operation.sort!.field];
        const aNumber = Number(a);
        const bNumber = Number(b);
        const comparison = Number.isFinite(aNumber) && Number.isFinite(bNumber)
          ? aNumber - bNumber
          : String(a ?? '').localeCompare(String(b ?? ''), 'zh-CN', { numeric: true });
        return (operation.sort!.direction === 'desc' ? -1 : 1) * comparison;
      }) : matched;
      const offset = Math.max(0, Math.floor(operation.offset || 0));
      const limit = Math.min(MAX_RESULT_ROWS, Math.max(1, Math.floor(operation.limit || MAX_RESULT_ROWS)));
      return { item, result: { operation: 'query', affectedRows: 0, totalRows: sorted.length, rows: sorted.slice(offset, offset + limit), truncated: sorted.length > offset + limit } satisfies AssistantArtifactDataResult };
    }
    if (operation.kind === 'insert') {
      if (!operation.values) throw new Error('insert 缺少 values');
      rows.push({ ...operation.values });
      affectedRows = 1;
    } else if (operation.kind === 'update') {
      if (!operation.values) throw new Error('update 缺少 values');
      rows = rows.map((row) => matches(row, operation.filter) ? (affectedRows += 1, { ...row, ...operation.values }) : row);
    } else if (operation.kind === 'delete') {
      rows = rows.filter((row) => {
        const matchedRow = matches(row, operation.filter);
        if (matchedRow) affectedRows += 1;
        return !matchedRow;
      });
    }
    const columns = format === 'csv' && 'columns' in parsed ? Array.from(new Set([...parsed.columns, ...rows.flatMap((row) => Object.keys(row))])) : [];
    const content = format === 'csv'
      ? stringifyCsv(columns, rows)
      : JSON.stringify('container' in parsed && parsed.container === 'array' ? rows : rows[0] || {}, null, 2);
    const nextVersion = { ...version, id: `${item.id}:data:${timestamp}:${Math.random().toString(36).slice(2, 7)}`, baseVersionId: version.id, content: resolved.filePath ? version.content : content, files: resolved.filePath ? version.files?.map((file) => file.path === resolved.filePath ? { ...file, content } : file) : version.files, changeSummary: `${operation.kind} ${affectedRows} 行`, updatedAt: timestamp, createdAt: timestamp, revision: 1 } satisfies AssistantArtifactVersion;
    const nextItem = { ...item, currentVersionId: nextVersion.id, versions: [...item.versions, nextVersion].slice(-12), updatedAt: timestamp };
    return { item: nextItem, result: { operation: operation.kind, affectedRows } satisfies AssistantArtifactDataResult };
  } catch (error) {
    return { item, result: { operation: operation.kind, affectedRows: 0, error: error instanceof Error ? error.message : '数据操作失败' } satisfies AssistantArtifactDataResult };
  }
}
