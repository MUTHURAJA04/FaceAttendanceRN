/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kiosk: {
          bg: '#111318',
          card: '#1A202C',
          border: '#2D3748',
          primary: '#0C83C6',
          secondary: '#D5E1FA',
          success: '#38A169',
          error: '#E53E3E',
          warning: '#F59E0B',
        },
      },
    },
  },
  plugins: [],
};
