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

function slotLine(slot: { startMinute: number; endMinute: number; label: string; notes?: string }): string {
  const t = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 1440) + 1440) % 1440 % 60).padStart(2, '0')}`;
  const notes = slot.notes?.trim() ? ` || ${slot.notes.trim().replaceAll('\n', '\\n')}` : '';
  return `- ${t(slot.startMinute)}-${t(slot.endMinute)} | ${slot.label}${notes}`;
}

const vaultPlugin = {
  name: 'vault-sync-mock',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use('/api/vault/day', async (req, res) => {
      try {
        if (req.method === 'GET') {
          const date = new URL(req.url ?? '', 'http://local').searchParams.get('date') ?? '';
          const filePath = vaultFilePath(date);
          const markdown = await fs.readFile(filePath, 'utf8').catch(() => '# Daily\n\n## Plan\n\n## Retrospect\n');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ date, filePath, planSlots: parseSection(markdown, 'Plan'), retrospectSlots: parseSection(markdown, 'Retrospect') }));
          return;
        }
        if (req.method === 'PUT') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', async () => {
            const payload = JSON.parse(body) as { date: string; planSlots: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }>; retrospectSlots: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }> };
            const filePath = vaultFilePath(payload.date);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            const md = ['## Plan', ...payload.planSlots.map(slotLine), '', '## Retrospect', ...payload.retrospectSlots.map(slotLine), ''].join('\n');
            await fs.writeFile(filePath, md, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, filePath }));
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
