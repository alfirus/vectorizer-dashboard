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
        "surface-hover": "#1a1a25",
        border: "#1e1e2e",
        primary: "#6366f1",
        "primary-hover": "#818cf8",
        accent: "#22d3ee",
        muted: "#64748b",
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
    },
  },
  plugins: [],
};
export default config;
