import assert from 'node:assert/strict';

async function contentSecurityPolicy(environment) {
  process.env.NODE_ENV = environment;
  const { default: config } = await import(`../next.config.mjs?environment=${environment}`);
  const rules = await config.headers();
  return rules
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy')?.value;
}

async function securityHeaders(environment) {
  process.env.NODE_ENV = environment;
  const { default: config } = await import(`../next.config.mjs?headers=${environment}`);
  const rules = await config.headers();
  return rules.flatMap((rule) => rule.headers);
}

const production = await contentSecurityPolicy('production');
assert.ok(production, 'production CSP must be configured');
assert.match(production, /connect-src 'self'/);
assert.doesNotMatch(production, /127\.0\.0\.1|localhost|ws:\/\//);
assert.match(production, /frame-ancestors 'none'/);
assert.match(production, /object-src 'none'/);
const productionHeaders = await securityHeaders('production');
assert.equal(
  productionHeaders.find((header) => header.key === 'Strict-Transport-Security')?.value,
  'max-age=31536000',
  'production responses must advertise one year of HSTS',
);
assert.ok(productionHeaders.some((header) => header.key === 'X-Content-Type-Options' && header.value === 'nosniff'));

const development = await contentSecurityPolicy('development');
assert.ok(development, 'development CSP must be configured');
assert.match(development, /http:\/\/127\.0\.0\.1:8100/);
assert.match(development, /ws:\/\/127\.0\.0\.1:8100/);

console.log('Production CSP is same-origin; local API and WebSocket sources are development-only.');
