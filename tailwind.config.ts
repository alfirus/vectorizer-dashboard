import type { Config } from "tailwindcss";

// Semantic surface colors are CSS variables (see app/globals.css :root / .dark)
// so the whole dashboard re-themes via the `dark` class on <html> with zero
// per-page changes. Accent colors (primary/success/warning/danger) are fixed
// hex — chosen to pass contrast on both light and dark surfaces.
const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-hover": "rgb(var(--surface-hover) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-light": "rgb(var(--border-light) / <alpha-value>)",
        primary: "#7c3aed",
        "primary-hover": "#8b5cf6",
        "primary-soft": "#7c3aed18",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-2": "rgb(var(--muted-2) / <alpha-value>)",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        cyan: "#06b6d4",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 3px rgb(var(--shadow) / 0.12), 0 0 0 1px rgb(var(--shadow) / 0.04)",
        glow: "0 0 20px rgba(124,58,237,0.25)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
