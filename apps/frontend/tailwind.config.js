/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#9b6cff', hover: '#b394ff' },
        obsidian: '#08090d',
        surface: '#11141b',
        'surface-2': '#171a22',
        accent: '#9b6cff',
        'accent-hover': '#b394ff',
        muted: '#8d929f',
        'border-subtle': 'rgba(255,255,255,.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
      },
      borderRadius: {
        card: '14px',
        panel: '20px',
        pill: '9999px',
      },
      boxShadow: {
        glow: '0 0 24px rgba(155,108,255,.35)',
        'glow-soft': '0 0 12px rgba(155,108,255,.20)',
      },
    },
  },
  plugins: [],
}
