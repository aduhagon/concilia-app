/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#1D9E75", dark: "#0F6E56", light: "#E1F5EE" }
      }
    }
  },
  plugins: []
}
