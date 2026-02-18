import type { Mode } from './types';

type Json = Record<string, unknown>;
type SlotPayload = { startMinute: number; endMinute: number; label: string; notes?: string };

type ModelContext = {
  registerTool: ((params: {
    name: string;
    title: string;
    description: string;
    inputSchema: Json;
    execute: (args: Json) => Promise<Json>;
  }) => void | (() => void)) &
    ((name: string, config: { title: string; description: string; inputSchema: Json }, handler: (args: Json) => Promise<Json>) => void | (() => void));
};

type NavigatorWithModelContext = Navigator & { modelContext?: ModelContext };
type WindowWithClockMcp = Window & { __clockToolsRegistered?: boolean };

function isDuplicateToolError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return error.name === 'InvalidStateError' && msg.includes('duplicate tool name');
}

const MODE_SCHEMA = { type: 'string', enum: ['plan', 'retrospect'] };
const TIME_PARTS_SCHEMA = {
  type: 'object',
  properties: { hour: { type: 'number', minimum: 0, maximum: 23 }, minute: { type: 'number', minimum: 0, maximum: 59 } },
  required: ['hour', 'minute']
} as const;
const WHERE_SCHEMA = {
  type: 'object',
  properties: {
    start: TIME_PARTS_SCHEMA,
    end: TIME_PARTS_SCHEMA,
    label: { type: 'string' },
    notes: { type: 'string' },
    labelContains: { type: 'string' }
  }
} as const;
const SLOT_SCHEMA = { ...WHERE_SCHEMA, required: ['start', 'end', 'label'] } as const;

function toMinute(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const parts = value as { hour?: unknown; minute?: unknown };
  if (typeof parts.hour !== 'number' || typeof parts.minute !== 'number') return undefined;
  return Math.trunc(parts.hour) * 60 + Math.trunc(parts.minute);
}

function requireMinute(value: unknown, key: string): number {
  const minute = toMinute(value);
  if (minute === undefined) throw new Error(`Invalid ${key}. Use {hour, minute}.`);
  return minute;
}

function normalizeWhere(where: Json): Json {
  return { ...where, ...(where.start ? { startMinute: requireMinute(where.start, 'where.start') } : {}), ...(where.end ? { endMinute: requireMinute(where.end, 'where.end') } : {}) };
}

async function runCrud(payload: Json): Promise<Json> {
  const endpoint =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/api/vault/crud`
      : 'http://127.0.0.1:5173/api/vault/crud';
  try {
    console.info('[webmcp] clock tool request', { endpoint, payload });
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.info('[webmcp] clock tool response status', { endpoint, status: res.status, ok: res.ok });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[webmcp] clock tool non-200 response', { endpoint, status: res.status, body });
      return {
        ok: false,
        error: `CRUD request failed (${res.status})`,
        status: res.status,
        endpoint
      };
    }
    const data = (await res.json()) as Json;
    console.info('[webmcp] clock tool response payload', data);
    return data;
  } catch (error) {
    console.error('[webmcp] clock tool fetch error', { endpoint, error, payload });
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      endpoint
    };
  }
}

function registerToolCompat(
  modelContext: ModelContext,
  name: string,
  description: string,
  required: string[],
  properties: Json,
  execute: (args: Json) => Promise<Json>
): void {
  const params = {
    name,
    title: name,
    description,
    inputSchema: { type: 'object', required: [...required], properties: JSON.parse(JSON.stringify(properties)) },
    execute
  };
  try {
    modelContext.registerTool(params);
    return;
  } catch (error) {
    if (isDuplicateToolError(error)) {
      console.info(`[webmcp] ${name} already registered; skipping`);
      return;
    }
    console.error(`[webmcp] object-style registerTool failed for ${name}`, { error, params });
  }
  try {
    modelContext.registerTool(name, { title: name, description, inputSchema: params.inputSchema }, execute);
  } catch (error) {
    if (isDuplicateToolError(error)) {
      console.info(`[webmcp] ${name} already registered via fallback; skipping`);
      return;
    }
    console.warn(`Failed to register WebMCP tool: ${name}`, error);
  }
}

export function registerClockCrudTools(): { registered: boolean } {
  const win = window as WindowWithClockMcp;
  if (win.__clockToolsRegistered) return { registered: true };
  const modelContext = (navigator as NavigatorWithModelContext).modelContext;
  if (!modelContext) return { registered: false };

  registerToolCompat(
    modelContext,
    'clock_read',
    'Read plan/retrospect slots by date or date range with optional filters.',
    ['mode', 'fromDate'],
    { mode: MODE_SCHEMA, fromDate: { type: 'string' }, toDate: { type: 'string' }, where: WHERE_SCHEMA },
    (args) => runCrud({ action: 'read', ...args })
  );

  registerToolCompat(
    modelContext,
    'clock_create',
    'Create one or more slots for a mode and date using start/end {hour, minute}.',
    ['mode', 'date', 'slots'],
    { mode: MODE_SCHEMA, date: { type: 'string' }, slots: { type: 'array', items: SLOT_SCHEMA } },
    async (args) =>
      runCrud({
        action: 'create',
        mode: args.mode as Mode,
        date: args.date as string,
        slots: ((args.slots as Json[]) ?? []).map((slot) => ({ ...slot, startMinute: requireMinute(slot.start, 'slot.start'), endMinute: requireMinute(slot.end, 'slot.end') })) as SlotPayload[]
      })
  );

  registerToolCompat(
    modelContext,
    'clock_update',
    'Update slot fields by match criteria using start/end {hour, minute}.',
    ['mode', 'date', 'where', 'patch'],
    { mode: MODE_SCHEMA, date: { type: 'string' }, where: WHERE_SCHEMA, patch: WHERE_SCHEMA, limit: { type: 'number' } },
    (args) => runCrud({ action: 'update', ...args, where: normalizeWhere((args.where as Json) ?? {}), patch: normalizeWhere((args.patch as Json) ?? {}) })
  );

  registerToolCompat(
    modelContext,
    'clock_delete',
    'Delete slot rows by match criteria using start/end {hour, minute}.',
    ['mode', 'date', 'where'],
    { mode: MODE_SCHEMA, date: { type: 'string' }, where: WHERE_SCHEMA, limit: { type: 'number' } },
    (args) => runCrud({ action: 'delete', ...args, where: normalizeWhere((args.where as Json) ?? {}) })
  );

  win.__clockToolsRegistered = true;
  return { registered: true };
}
