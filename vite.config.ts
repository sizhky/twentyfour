import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'node:path';

const VAULT_ROOT = '/Users/yeshwanth/Vault/00-09 Me/03 Daily';

function vaultFilePath(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  const compact = isoDate.replaceAll('-', '');
  return path.join(VAULT_ROOT, year, month, `${compact}-plan.md`);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sendBadRequest(res: import('node:http').ServerResponse, message: string): void {
  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: message }));
}

function parseSection(markdown: string, section: 'Plan' | 'Retrospect') {
  const block = markdown.match(new RegExp(`## ${section}\\n([\\s\\S]*?)(\\n## |$)`));
  if (!block?.[1]) return [];
  return block[1]
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^- (\d{2}):(\d{2})-(\d{2}):(\d{2}) \| (.+)$/))
    .filter(Boolean)
    .map((m) => ({
      startMinute: Number(m![1]) * 60 + Number(m![2]),
      endMinute: Number(m![3]) * 60 + Number(m![4]),
      label: m![5].split(' || ')[0].trim(),
      notes: m![5].includes(' || ') ? m![5].split(' || ').slice(1).join(' || ').replaceAll('\\n', '\n').trim() : ''
    }));
}

function parseBlock(markdown: string, section: 'Plan' | 'Retrospect' | 'Superseded Plans'): string[] {
  const block = markdown.match(new RegExp(`## ${section}\\n([\\s\\S]*?)(\\n## |$)`));
  if (!block?.[1]) return [];
  return block[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function slotLine(slot: { startMinute: number; endMinute: number; label: string; notes?: string }): string {
  const t = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 1440) + 1440) % 1440 % 60).padStart(2, '0')}`;
  const notes = slot.notes?.trim() ? ` || ${slot.notes.trim().replaceAll('\n', '\\n')}` : '';
  return `- ${t(slot.startMinute)}-${t(slot.endMinute)} | ${slot.label}${notes}`;
}

function buildMarkdown(
  planSlots: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }>,
  retrospectSlots: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }>,
  supersededLines: string[]
): string {
  return [
    '## Plan',
    ...planSlots.map(slotLine),
    '',
    '## Retrospect',
    ...retrospectSlots.map(slotLine),
    '',
    '## Superseded Plans',
    ...supersededLines,
    ''
  ].join('\n');
}

type SlotPayload = { startMinute: number; endMinute: number; label: string; notes?: string };
type CrudWhere = Partial<SlotPayload> & { labelContains?: string };

function listDates(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  let cur = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

function matchesWhere(slot: SlotPayload, where?: CrudWhere): boolean {
  if (!where) return true;
  if (where.startMinute !== undefined && slot.startMinute !== where.startMinute) return false;
  if (where.endMinute !== undefined && slot.endMinute !== where.endMinute) return false;
  if (where.label !== undefined) {
    const slotLabel = slot.label.trim().toLowerCase();
    const whereLabel = where.label.trim().toLowerCase();
    if (slotLabel !== whereLabel) return false;
  }
  if (where.notes !== undefined && (slot.notes ?? '') !== where.notes) return false;
  if (where.labelContains && !slot.label.toLowerCase().includes(where.labelContains.toLowerCase())) return false;
  return true;
}

const vaultPlugin = {
  name: 'vault-sync-mock',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use('/api/vault', async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://local');
        const pathname = url.pathname;
        if (req.method === 'GET' && pathname.endsWith('/day')) {
          const date = url.searchParams.get('date') ?? '';
          if (!isIsoDate(date)) {
            sendBadRequest(res, 'Invalid or missing date (expected YYYY-MM-DD).');
            return;
          }
          const filePath = vaultFilePath(date);
          const markdown = await fs.readFile(filePath, 'utf8').catch(() => '# Daily\n\n## Plan\n\n## Retrospect\n');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ date, filePath, planSlots: parseSection(markdown, 'Plan'), retrospectSlots: parseSection(markdown, 'Retrospect') }));
          return;
        }
        if (req.method === 'PUT' && pathname.endsWith('/day')) {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', async () => {
            const payload = JSON.parse(body) as { date: string; planSlots: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }>; retrospectSlots: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }> };
            if (!isIsoDate(payload.date)) {
              sendBadRequest(res, 'Invalid or missing payload.date (expected YYYY-MM-DD).');
              return;
            }
            const filePath = vaultFilePath(payload.date);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            const existing = await fs.readFile(filePath, 'utf8').catch(() => '');
            const supersededLines = parseBlock(existing, 'Superseded Plans');
            const md = buildMarkdown(payload.planSlots, payload.retrospectSlots, supersededLines);
            await fs.writeFile(filePath, md, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, filePath }));
          });
          return;
        }
        if (req.method === 'POST' && pathname.endsWith('/supersede')) {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', async () => {
            const payload = JSON.parse(body) as { date: string; slot: { startMinute: number; endMinute: number; label: string; notes?: string } };
            if (!isIsoDate(payload.date)) {
              sendBadRequest(res, 'Invalid or missing payload.date (expected YYYY-MM-DD).');
              return;
            }
            const filePath = vaultFilePath(payload.date);
            const existing = await fs.readFile(filePath, 'utf8').catch(() => '');
            const planSlots = parseSection(existing, 'Plan');
            const retrospectSlots = parseSection(existing, 'Retrospect');
            const superseded = parseBlock(existing, 'Superseded Plans');
            const retiredAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
            superseded.push(`${slotLine(payload.slot)} || superseded_at=${retiredAt}`);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, buildMarkdown(planSlots, retrospectSlots, superseded), 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, filePath }));
          });
          return;
        }
        if (req.method === 'POST' && pathname.endsWith('/crud')) {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', async () => {
            const payload = JSON.parse(body) as
              | { action: 'read'; mode: 'plan' | 'retrospect'; fromDate: string; toDate?: string; where?: CrudWhere }
              | { action: 'create'; mode: 'plan' | 'retrospect'; date: string; slots: SlotPayload[] }
              | { action: 'update'; mode: 'plan' | 'retrospect'; date: string; where: CrudWhere; patch: Partial<SlotPayload>; limit?: number }
              | { action: 'delete'; mode: 'plan' | 'retrospect'; date: string; where: CrudWhere; limit?: number };
            if (payload.action === 'read') {
              if (!isIsoDate(payload.fromDate) || (payload.toDate !== undefined && !isIsoDate(payload.toDate))) {
                sendBadRequest(res, 'Invalid fromDate/toDate (expected YYYY-MM-DD).');
                return;
              }
              const dates = listDates(payload.fromDate, payload.toDate ?? payload.fromDate);
              const results = await Promise.all(dates.map(async (date) => {
                const filePath = vaultFilePath(date);
                const md = await fs.readFile(filePath, 'utf8').catch(() => '');
                const slots = parseSection(md, payload.mode === 'plan' ? 'Plan' : 'Retrospect').filter((s) => matchesWhere(s, payload.where));
                return { date, mode: payload.mode, slots };
              }));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, results }));
              return;
            }
            if (!isIsoDate(payload.date)) {
              sendBadRequest(res, 'Invalid or missing payload.date (expected YYYY-MM-DD).');
              return;
            }
            const filePath = vaultFilePath(payload.date);
            const existing = await fs.readFile(filePath, 'utf8').catch(() => '');
            const planSlots = parseSection(existing, 'Plan');
            const retrospectSlots = parseSection(existing, 'Retrospect');
            const superseded = parseBlock(existing, 'Superseded Plans');
            const target = payload.mode === 'plan' ? planSlots : retrospectSlots;
            if (payload.action === 'create') target.push(...payload.slots);
            if (payload.action === 'update') {
              let n = 0;
              for (const slot of target) if (matchesWhere(slot, payload.where) && (!payload.limit || n < payload.limit)) { Object.assign(slot, payload.patch); n += 1; }
            }
            if (payload.action === 'delete') {
              let n = 0;
              const kept = target.filter((slot) => !(matchesWhere(slot, payload.where) && (!payload.limit || n++ < payload.limit)));
              target.splice(0, target.length, ...kept);
            }
            const normalize = (slots: SlotPayload[]) => slots.sort((a, b) => a.startMinute - b.startMinute);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, buildMarkdown(normalize(planSlots), normalize(retrospectSlots), superseded), 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, date: payload.date, mode: payload.mode }));
          });
          return;
        }
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
  }
};

export default defineConfig({
  plugins: [react(), vaultPlugin]
});
