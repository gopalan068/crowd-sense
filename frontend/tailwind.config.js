/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="night"]'],
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
