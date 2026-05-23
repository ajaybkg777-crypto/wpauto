/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#075E54',
          light: '#128C7E',
          dark: '#064E45'
        },
        accent: {
          DEFAULT: '#25D366',
          light: '#DCFCE7',
          dark: '#16A34A'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}