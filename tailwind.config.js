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
          base:    '#F5A876',
          surface: 'rgba(255,245,230,0.75)',
          raised:  'rgba(255,235,210,0.6)',
          border:  'rgba(200,140,90,0.2)',
        },
        brand: {
          DEFAULT: '#E05A3A',
          light:   '#F07050',
          coral:   '#E8604C',
          peach:   '#F4A86A',
        },
        clay: {
          mint:    '#8FC4A8',
          pink:    '#F4A0B0',
          lavender:'#C4B5D4',
          green:   '#4A7A5A',
          cream:   '#FFF5E8',
          sand:    '#E8C89A',
        },
        sidebar: '#1E1B18',
        text: {
          primary:   '#2A1F10',
          secondary: '#6B5040',
          muted:     '#A08060',
        },
      },
      fontFamily: {
        display: ['Poppins', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'clay':  '0 8px 32px rgba(120,70,30,0.15), 0 2px 8px rgba(120,70,30,0.1)',
        'clay-lg': '0 20px 60px rgba(120,70,30,0.2), 0 4px 16px rgba(120,70,30,0.12)',
        'soft':  '0 4px 20px rgba(180,100,50,0.12)',
        'inset': 'inset 0 1px 0 rgba(255,255,255,0.5)',
      },
    },
  },
  plugins: [],
};
