/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obd: {
          dark: '#0a0a0a',
          surface: '#1a1a2e',
          primary: '#00d4ff',
          accent: '#0abdc6',
          dim: '#4a4a6a',
          warn: '#ff6b35',
          danger: '#ff2e63',
        },
      },
    },
  },
  plugins: [],
};
