/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{tsx,ts,jsx,js}'],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#1e1e2e',
          surface: '#313244',
          text: '#cdd6f4',
          subtext: '#a6adc8',
          accent: '#89b4fa',
          green: '#a6e3a1',
          red: '#f38ba8',
          border: '#45475a'
        }
      }
    }
  },
  plugins: []
}
