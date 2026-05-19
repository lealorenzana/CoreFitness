/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary-start': '#FDB813',
        'primary-end': '#FF6B35',
        'secondary': '#8B5CF6',
        'dark': '#0A0A0A',
        'dark-lighter': '#1A1A1A',
        'dark-border': '#2A2A2A',
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
