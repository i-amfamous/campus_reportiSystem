export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff5ff',
          100: '#dbe8fe',
          200: '#bfd7fe',
          300: '#93bcfd',
          400: '#6097fa',
          500: '#407bd9',
          600: '#2f63c0',
          700: '#28509c',
          800: '#264581',
          900: '#243b6b',
          950: '#1a2747',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 18px 50px -28px rgba(33, 33, 43, 0.18)',
        lift: '0 34px 80px -34px rgba(64, 123, 217, 0.38)',
      },
    },
  },
  plugins: [],
};
