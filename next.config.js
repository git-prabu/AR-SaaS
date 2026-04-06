/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  compress: true,
  images: {
    domains: [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
    ],
  },
  // Allow model-viewer custom element
  compiler: {
    styledComponents: false,
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
};

module.exports = nextConfig;
