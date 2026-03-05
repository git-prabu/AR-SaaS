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
          base:    '#0f0c1a',
          surface: 'rgba(255,255,255,0.07)',
          raised:  'rgba(255,255,255,0.05)',
          border:  'rgba(255,255,255,0.12)',
        },
        brand: {
          DEFAULT: '#FF6B35',
          light:   '#FF8C5A',
          amber:   '#FFB347',
          pink:    '#FF8FB1',
          purple:  '#9364FF',
        },
        text: {
          primary:   '#F0EEF8',
          secondary: '#B8B4CC',
          muted:     '#7A768A',
        },
      },
      fontFamily: {
        display: ['Poppins', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
        'card':  '0 4px 24px rgba(0,0,0,0.25)',
        'glow':  '0 0 40px rgba(255,107,53,0.3)',
      },
    },
  },
  plugins: [],
};
