/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1rem',
        md: '2rem',
        lg: '3rem',
      }
    },
    extend: {
      // Same system font as the iPhone app (SF Pro on Apple devices), Inter elsewhere
      fontFamily: {
        inter: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Black & orange palette of the iPhone app (mobile/constants/theme.ts)
        brand: {
          DEFAULT: 'rgb(255 107 0 / <alpha-value>)', // #FF6B00
          light: 'rgb(255 140 58 / <alpha-value>)', // #FF8C3A
          dark: 'rgb(232 95 0 / <alpha-value>)', // #E85F00
          deep: 'rgb(255 61 0 / <alpha-value>)', // #FF3D00
        },
        // Dark glass surfaces (cards, menus, sheets)
        surface: {
          DEFAULT: 'rgb(24 24 28 / <alpha-value>)', // cards on the page
          raised: 'rgb(30 30 35 / <alpha-value>)', // menus, popovers, sheets
        },
        ink: '#060608', // page background
      },
      boxShadow: {
        soft: '0 8px 24px rgba(0,0,0,0.35)',
        glass: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.45)',
        brand: '0 8px 24px rgba(255,107,0,0.35)',
      },
      borderRadius: {
        'xl2': '1.25rem'
      },
      // Plain `border` / `divide` / `ring` without a color: hairlines and orange focus on dark
      borderColor: { DEFAULT: 'rgb(255 255 255 / 0.10)' },
      ringColor: { DEFAULT: 'rgb(255 107 0 / 0.5)' },
    },
  },
  plugins: [],
}
