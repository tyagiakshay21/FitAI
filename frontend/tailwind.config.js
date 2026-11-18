/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        chalk: '#F1F3EE',
        ink: { DEFAULT: '#10201C', soft: '#4A5A55', faint: '#8A9893' },
        pine: { DEFAULT: '#1F6F5B', dark: '#0E2A26', mid: '#164A3E', light: '#DCEBE5' },
        coral: '#E5544B',
        amber: '#E9A72C',
        lane: '#3B6FE0',
        line: '#DDE2DC',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl2: '18px' },
    },
  },
  plugins: [],
};
