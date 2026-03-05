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
          base:    '#F5F4F0',
          surface: '#FFFFFF',
          raised:  '#EEECEA',
          border:  '#E2DED8',
        },
        brand: {
          DEFAULT: '#FF6B35',
          light:   '#FF8C5A',
          amber:   '#FFB347',
          glow:    'rgba(255,107,53,0.12)',
        },
        text: {
          primary:   '#1C1917',
          secondary: '#6B6460',
          muted:     '#A09890',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'brand-glow': '0 0 40px rgba(255,107,53,0.2)',
        'card':  '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        'soft': '0 4px 24px rgba(0,0,0,0.07)',
      },
    },
  },
  plugins: [],
};
