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
      fontFamily: { inter: ['Inter', 'sans-serif'] },
      colors: {
        bg: "#0f1220",
        panel: "#ffffff",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.08)",
        glass: "0 10px 50px rgba(0,0,0,0.10)",
      },
      borderRadius: {
        'xl2': '1.25rem'
      }
    },
  },
  plugins: [],
}

