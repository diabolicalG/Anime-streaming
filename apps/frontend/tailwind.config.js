/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#6366f1', hover: '#4f46e5' },
        obsidian: '#080C13',
        surface: '#12121B',
        accent: '#7440FF',
        'accent-hover': '#8B5FFF',
        muted: '#8A8A9A',
        'border-subtle': 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
      },
      borderRadius: {
        card: '12px',
        panel: '16px',
        pill: '9999px',
      },
      boxShadow: {
        glow: '0 0 24px rgba(116,64,255,0.35)',
        'glow-soft': '0 0 12px rgba(116,64,255,0.20)',
      },
    },
  },
  plugins: [],
}