import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#111111',
        muted: '#f4f4f5',
        'muted-foreground': '#71717a',
        accent: '#27272a',
        brand: {
          50: '#f0f6ff',
          100: '#e0edff',
          200: '#c0daff',
          300: '#90bfff',
          400: '#5c9dff',
          500: '#337fff',
          600: '#1a5aff',
          700: '#0040ff',
          800: '#0033cc',
          900: '#002d72',
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['British Empire', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      boxShadow: {
        glass: '0 4px 30px rgba(0, 0, 0, 0.03)',
        'glass-hover': '0 10px 40px rgba(0, 0, 0, 0.08)',
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.8) 100%)',
        'fade-to-black': 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 100%)',
      }
    },
  },
  plugins: [],
} satisfies Config
