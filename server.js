import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = join(root, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir);
const database = new DatabaseSync(join(dataDir, 'khoj-khabar.sqlite'));
database.exec(`CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, status TEXT NOT NULL, location TEXT NOT NULL, date TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
const sessions = new Set();
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'change-me-now';

function send(response, status, body, headers = {}) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); response.end(JSON.stringify(body)); }
function parseCookies(request) { return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map(cookie => cookie.trim().split('='))); }
function isAdmin(request) { const token = parseCookies(request).admin_session; return token && sessions.has(token); }
async function body(request) { let raw = ''; for await (const chunk of request) raw += chunk; if (raw.length > 12_000_000) throw new Error('Request is too large.'); return raw ? JSON.parse(raw) : {}; }
function publicItem(row) { return { ...row, id: String(row.id) }; }
function allItems() { return database.prepare('SELECT id, title, status, location, date, details, image FROM items ORDER BY created_at DESC, id DESC').all().map(publicItem); }
function routePath(request) { return new URL(request.url, 'http://localhost').pathname; }

async function handleApi(request, response) {
  const path = routePath(request);
  if (request.method === 'GET' && path === '/api/items') return send(response, 200, allItems());
  if (request.method === 'GET' && path.startsWith('/api/items/')) {
    const row = database.prepare('SELECT id, title, status, location, date, details, image FROM items WHERE id = ?').get(path.split('/').pop());
    return row ? send(response, 200, publicItem(row)) : send(response, 404, { error: 'Notice not found.' });
  }
  if (request.method === 'POST' && path === '/api/items') {
    const data = await body(request);
    if (!data.title || !data.location || !data.date || !['Found', 'Looking for'].includes(data.status)) return send(response, 400, { error: 'Title, status, location and date are required.' });
    database.prepare('INSERT INTO items (title, status, location, date, details, image) VALUES (?, ?, ?, ?, ?, ?)').run(String(data.title).trim(), data.status, String(data.location).trim(), String(data.date).trim(), String(data.details || '').trim(), String(data.image || ''));
    return send(response, 201, { ok: true });
  }
  if (path === '/api/admin/login' && request.method === 'POST') {
    const data = await body(request);
    const validUser = data.username === adminUsername;
    const expected = Buffer.from(adminPassword);
    const received = Buffer.from(String(data.password || ''));
    const validPassword = expected.length === received.length && timingSafeEqual(expected, received);
    if (!validUser || !validPassword) return send(response, 401, { error: 'Invalid admin credentials.' });
    const token = randomBytes(32).toString('hex');
    sessions.add(token);
    return send(response, 200, { ok: true }, { 'Set-Cookie': `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/` });
  }
  if (!isAdmin(request)) return send(response, 401, { error: 'Admin login required.' });
  if (request.method === 'DELETE' && path.startsWith('/api/admin/items/')) {
    database.prepare('DELETE FROM items WHERE id = ?').run(path.split('/').pop());
    return send(response, 200, { ok: true });
  }
  if (request.method === 'PATCH' && path.startsWith('/api/admin/items/')) {
    const data = await body(request);
    if (data.status !== 'Found') return send(response, 400, { error: 'Only Found is a valid moderation status.' });
    database.prepare('UPDATE items SET status = ? WHERE id = ?').run('Found', path.split('/').pop());
    return send(response, 200, { ok: true });
  }
  return send(response, 404, { error: 'API route not found.' });
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (request, response) => {
  try {
    if (routePath(request).startsWith('/api/')) return await handleApi(request, response);
    const requested = normalize(join(root, routePath(request) === '/' ? 'index.html' : routePath(request).slice(1)));
    if (!requested.startsWith(root)) return response.writeHead(403).end();
    const content = await readFile(requested);
    response.writeHead(200, { 'Content-Type': `${mime[extname(requested)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') return response.writeHead(404).end('Not found');
    send(response, 500, { error: 'Server error.' });
  }
});
server.listen(process.env.PORT || 4173, () => console.log(`Khoj Khabar running at http://localhost:${process.env.PORT || 4173}`));
