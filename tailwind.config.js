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
        slate: {
          850: '#0F1522', // panel elevated dark mode
          750: '#1A253A', // secondary elevated / hover dark mode
        },
        surveillance: {
          950: '#070A0F', // deep abyss background
          900: '#0B0F17', // main workspace background
          850: '#0F1522', // panel background
          800: '#141D2E', // card/panel elevated
          750: '#1A253A', // secondary elevated / hover
          700: '#23324E', // subtle border
          600: '#32476E', // active border
          500: '#4A659A', // muted text
          400: '#7E95C2', // secondary text
          300: '#ADC0E3', // primary label text
          200: '#D5E1F7', // bright text
          100: '#EBF2FF', // white-adjacent highlight
        },
        tactical: {
          cyan: '#00E5FF',
          blue: '#2563EB',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#F43F5E',
          red: '#EF4444',
          violet: '#8B5CF6',
        },
        zone: {
          emergency: '#EF4444',
          caution: '#F59E0B',
          safe: '#10B981',
          info: '#00E5FF',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'tactical': '0 0 15px -3px rgba(0, 229, 255, 0.15)',
        'alert': '0 0 20px -3px rgba(239, 68, 68, 0.3)',
        'warning': '0 0 20px -3px rgba(245, 158, 11, 0.25)',
        'hud': 'inset 0 0 20px 0 rgba(0, 0, 0, 0.6)',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar-sweep': 'radarSweep 4s linear infinite',
        'scanline': 'scanline 8s linear infinite',
      },
      keyframes: {
        radarSweep: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1000%)' },
        }
      }
    },
  },
  plugins: [],
}
