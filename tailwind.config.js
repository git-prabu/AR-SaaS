/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base:    '#09090B',
          surface: '#111115',
          raised:  '#18181D',
          border:  '#27272E',
        },
        brand: {
          DEFAULT: '#FF6B35',
          light:   '#FF8C5A',
          amber:   '#FFB347',
          glow:    'rgba(255,107,53,0.15)',
        },
        text: {
          primary:   '#F2F2EE',
          secondary: '#8E8E9A',
          muted:     '#55555F',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
      },
      boxShadow: {
        'brand-glow': '0 0 40px rgba(255,107,53,0.25)',
        'card': '0 2px 16px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
