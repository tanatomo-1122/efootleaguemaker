/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#050505',
        carbon: '#111111',
        steel: '#1c1c1c',
        volt: '#D8FF00',
        pitch: '#0A3B2C',
        pitchdark: '#04231A',
        gold: '#E8C56A',
        chalk: '#F5F5F0',
      },
      fontFamily: {
        display: ['"Archivo Black"', '"Anton"', 'Impact', 'sans-serif'],
        sans: ['"Inter"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 20px 60px -20px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [],
};
