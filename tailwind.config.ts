import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0c0a09",
          800: "#1c1917",
          700: "#292524",
          600: "#44403c",
          500: "#78716c",
          400: "#a8a29e",
          300: "#d6d3d1",
          200: "#e7e5e4",
          100: "#f5f5f4",
          50: "#fafaf9",
        },
        accent: {
          DEFAULT: "#0f4c4a",   // verde profundo (tipo libro contable)
          light: "#e6f0ef",
          dark: "#0a3331",
        },
        warn: "#b45309",
        error: "#991b1b",
        ok: "#0f4c4a",
      },
      fontFamily: {
        serif: ["Source Serif 4", "Georgia", "serif"],
        sans: ["Inter Tight", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": "0.6875rem",
      },
    },
  },
  plugins: [],
}
export default config
