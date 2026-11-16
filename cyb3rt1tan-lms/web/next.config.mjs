const localConnectSources =
  process.env.NODE_ENV === 'development' ? ' http://127.0.0.1:8100 ws://127.0.0.1:8100' : '';
const csp =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'" +
  localConnectSources +
  "; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
export default {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/v1/:path*', destination: 'http://127.0.0.1:8100/v1/:path*' }];
  },
  async headers() {
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ];
    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
    }
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
