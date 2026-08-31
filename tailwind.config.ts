import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "#12121a",
        "surface-hover": "#1e1e2e",
        card: "#16161f",
        border: "#23233a",
        "border-light": "#2a2a4a",
        primary: "#7c3aed",
        "primary-hover": "#8b5cf6",
        "primary-soft": "#7c3aed18",
        muted: "#6b7289",
        "muted-2": "#94a3b8",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        foreground: "#f1f1f4",
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
        card: "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
        glow: "0 0 20px rgba(124,58,237,0.25)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
