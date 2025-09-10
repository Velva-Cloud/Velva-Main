/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Use default output for next start to avoid runtime warning
  // output: 'standalone',
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) return [];
    const base = target.replace(/\/$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${base}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;