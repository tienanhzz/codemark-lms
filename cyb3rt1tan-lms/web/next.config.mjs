const csp =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://127.0.0.1:8100 ws://127.0.0.1:8100; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
export default {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/v1/:path*', destination: 'http://127.0.0.1:8100/v1/:path*' }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
