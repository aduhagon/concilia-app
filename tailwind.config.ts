import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Grises neutros (escala fina — software contable usa muchos grises)
        ink: {
          950: "#0a0a0a",
          900: "#171717",
          800: "#262626",
          700: "#404040",
          600: "#525252",
          500: "#737373",
          400: "#a3a3a3",
          300: "#d4d4d4",
          200: "#e5e5e5",
          150: "#ededed",
          100: "#f5f5f5",
          50: "#fafafa",
        },
        // Colores funcionales (cada uno con un significado contable claro)
        ok: {
          DEFAULT: "#15803d",
          light: "#dcfce7",
          dark: "#14532d",
        },
        warn: {
          DEFAULT: "#b45309",
          light: "#fef3c7",
          dark: "#78350f",
        },
        danger: {
          DEFAULT: "#b91c1c",
          light: "#fee2e2",
          dark: "#7f1d1d",
        },
        info: {
          DEFAULT: "#1e40af",
          light: "#dbeafe",
          dark: "#1e3a8a",
        },
        adjust: {
          DEFAULT: "#6d28d9",
          light: "#ede9fe",
          dark: "#5b21b6",
        },
        // Acento principal (verde oliva sobrio)
        accent: {
          DEFAULT: "#166534",
          light: "#f0fdf4",
          dark: "#14532d",
          50: "#f7fee7",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        "subtle": "0 1px 2px 0 rgba(0,0,0,0.04)",
        "panel": "0 0 0 1px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
}
export default config
