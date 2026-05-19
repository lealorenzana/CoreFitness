/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary-start': '#FDB813',
        'primary-end': '#FF6B35',
        'neon-yellow': '#D4FF00',
        'neon-green': '#B8E600',
        'secondary': '#8B5CF6',
        'dark': '#0A0A0A',
        'dark-lighter': '#1A1A1A',
        'dark-border': '#2A2A2A',
        'light': '#FFFFFF',
        'light-secondary': '#F5F5F5',
        'light-border': '#E5E5E5',
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        bebas: ['Bebas Neue', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
