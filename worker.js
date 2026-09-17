const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
});

function publicItem(row) {
  return { ...row, id: String(row.id) };
}

function itemsFrom(result) {
  return result.results.map(publicItem);
}

function cookieValue(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : '';
}

function encode(value) {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decode(value) {
  return atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return encode(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))));
}

async function isAdmin(request, env) {
  const token = cookieValue(request, 'admin_session');
  if (!token) return false;
  try {
    const [timestamp, signature] = decode(token).split('.');
    if (!timestamp || Date.now() - Number(timestamp) > 86_400_000) return false;
    return await sign(timestamp, env.ADMIN_SECRET).then(expected => expected === signature);
  } catch {
    return false;
  }
}

async function readBody(request) {
  const data = await request.json();
  if (JSON.stringify(data).length > 12_000_000) throw new Error('Request is too large.');
  return data;
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'GET' && path === '/api/items') {
    const result = await env.DB.prepare('SELECT id, title, status, location, date, details, image FROM items ORDER BY created_at DESC, id DESC').all();
    return json(itemsFrom(result));
  }

  if (request.method === 'GET' && path.startsWith('/api/items/')) {
    const row = await env.DB.prepare('SELECT id, title, status, location, date, details, image FROM items WHERE id = ?').bind(path.split('/').pop()).first();
    return row ? json(publicItem(row)) : json({ error: 'Notice not found.' }, 404);
  }

  if (request.method === 'POST' && path === '/api/items') {
    const data = await readBody(request);
    if (!data.title || !data.location || !data.date || !['Found', 'Looking for'].includes(data.status)) return json({ error: 'Title, status, location and date are required.' }, 400);
    await env.DB.prepare('INSERT INTO items (title, status, location, date, details, image) VALUES (?, ?, ?, ?, ?, ?)').bind(String(data.title).trim(), data.status, String(data.location).trim(), String(data.date).trim(), String(data.details || '').trim(), String(data.image || '')).run();
    return json({ ok: true }, 201);
  }

  if (request.method === 'POST' && path === '/api/admin/login') {
    const data = await readBody(request);
    if (data.username !== env.ADMIN_USERNAME || data.password !== env.ADMIN_PASSWORD) return json({ error: 'Invalid admin credentials.' }, 401);
    const timestamp = String(Date.now());
    const token = encode(`${timestamp}.${await sign(timestamp, env.ADMIN_SECRET)}`);
    const secureCookie = url.protocol === 'https:' ? '; Secure' : '';
    return json({ ok: true }, 200, { 'Set-Cookie': `admin_session=${token}; HttpOnly${secureCookie}; SameSite=Strict; Path=/; Max-Age=86400` });
  }

  if (!await isAdmin(request, env)) return json({ error: 'Admin login required.' }, 401);
  const id = path.split('/').pop();
  if (request.method === 'DELETE' && path.startsWith('/api/admin/items/')) {
    await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (request.method === 'PATCH' && path.startsWith('/api/admin/items/')) {
    const data = await readBody(request);
    if (data.status !== 'Found') return json({ error: 'Only Found is a valid moderation status.' }, 400);
    await env.DB.prepare('UPDATE items SET status = ? WHERE id = ?').bind('Found', id).run();
    return json({ ok: true });
  }
  return json({ error: 'API route not found.' }, 404);
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      try {
        return await api(request, env);
      } catch (error) {
        return json({ error: error.message || 'Server error.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
