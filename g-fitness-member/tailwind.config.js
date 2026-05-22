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
        // ── Core Fitness Official Palette — Yellow + Violet + Black ────
        'brand-yellow':       '#F6C90E',   // primary yellow (flat)
        'brand-yellow-dark':  '#D4A800',   // darker yellow for hover
        'brand-violet':       '#7B2FBE',   // primary violet (flat)
        'brand-violet-light': '#9B4DFF',   // lighter violet
        'brand-violet-dark':  '#5A1F8A',   // darker violet for hover
        // Backgrounds (dark neutral)
        'dark':               '#0A0A0F',
        'dark-lighter':       '#12101A',
        'dark-surface':       '#1A1628',
        'dark-card':          '#1A1628',
        'dark-border':        '#2A2040',
        // Text
        'text-primary':       '#FFFFFF',
        'text-secondary':     '#C0B8D0',
        'text-muted':         '#6B6080',
        // Legacy aliases kept for compatibility
        'primary-start':      '#F6C90E',
        'primary-end':        '#F6C90E',
        'brand-purple':       '#7B2FBE',
        'brand-purple-light': '#9B4DFF',
        'gold':               '#F6C90E',
        'gold-deep':          '#D4A800',
        'gold-bright':        '#F6C90E',
        'secondary':          '#7B2FBE',
        'light':              '#FFFFFF',
        'light-secondary':    '#F5F5F5',
        'light-border':       '#E5E5E5',
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        orbitron: ['Inter', 'sans-serif'],
        bebas: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
