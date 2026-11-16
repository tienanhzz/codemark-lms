// Check the real production Next.js rewrite, not just the exported config object.
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:3100';
let ready = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
    if (response.ok) { ready = true; break; }
  } catch { /* The isolated CI web process may still be starting. */ }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert(ready, 'The production web server did not become ready.');

for (const path of ['/socket.io/', '/socket.io']) {
  const url = new URL(path, origin);
  url.search = 'EIO=4&transport=polling';
  const response = await fetch(url, {
    headers: { Origin: origin }, redirect: 'manual', signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, `Engine.IO ${path} redirected or failed.`);
  const body = await response.text();
  assert.equal(body[0], '0', 'The proxy did not return an Engine.IO open packet.');
  const packet = JSON.parse(body.slice(1));
  assert.equal(typeof packet.sid, 'string');
  // End the anonymous transport immediately; no application session is created.
  url.searchParams.set('sid', packet.sid);
  const close = await fetch(url, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '1',
    redirect: 'manual', signal: AbortSignal.timeout(5000),
  });
  assert.equal(close.status, 200);
}
console.log('PASS: production Next.js same-origin Engine.IO polling; both path forms avoid redirects.');
