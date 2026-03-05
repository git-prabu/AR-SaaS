/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
    ],
  },
  // Allow model-viewer custom element
  compiler: {
    styledComponents: false,
  },
};

module.exports = nextConfig;
