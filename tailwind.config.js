/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: 'var(--ink-950)', 800: 'var(--ink-800)' },
        paper: { 100: 'var(--paper-100)', 200: 'var(--paper-200)' },
        rust: { 600: 'var(--rust-600)', 500: 'var(--rust-500)' },
        bronze: { 500: 'var(--bronze-500)' },
        mist: { 400: 'var(--mist-400)' },
      },
    },
  },
  plugins: [],
};
