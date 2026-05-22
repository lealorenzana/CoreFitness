/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // ── Core Fitness Official Palette — Yellow + Violet + Black ────
        'brand-yellow':   '#F6C90E',   // primary yellow (flat)
        'brand-yellow-dark': '#D4A800', // darker yellow for hover
        'brand-violet':   '#7B2FBE',   // primary violet (flat)
        'brand-violet-light': '#9B4DFF', // lighter violet
        'brand-violet-dark': '#5A1F8A', // darker violet for hover
        // Backgrounds (dark neutral)
        dark:             '#0A0A0F',
        'dark-lighter':   '#12101A',
        'dark-surface':   '#1A1628',
        'dark-border':    '#2A2040',
        // Legacy aliases kept for compatibility
        'primary-start':  '#F6C90E',
        'primary-end':    '#F6C90E',
        'brand-purple':   '#7B2FBE',
        'brand-purple-light': '#9B4DFF',
        // Text
        'text-primary':   '#FFFFFF',
        'text-secondary': '#C0B8D0',
        'text-muted':     '#6B6080',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        // Keep orbitron alias but use Inter as default
        orbitron: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
