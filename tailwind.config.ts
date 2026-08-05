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
        blue: {
          50: '#fff8e6',
          100: '#ffedbd',
          500: '#e9a51a',
          600: '#e19200',
          700: '#a96800',
        },
        sky: {
          100: '#ffedbd',
          700: '#a96800',
        },
        indigo: {
          50: '#fff8e6',
        },
        brand: {
          50: '#fff8e6',
          100: '#ffedbd',
          200: '#ffdc80',
          300: '#f8c34d',
          400: '#e9a51a',
          500: '#e19200',
          600: '#e19200',
          700: '#a96800',
          800: '#7d4c00',
          900: '#543300',
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
