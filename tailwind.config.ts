import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "#0B0E14",
        surface: "#12171F",
        card: "#181F2A",
        "border-subtle": "#222B38",
        "border-focus": "#384556",
        "text-primary": "#F1F5F9",
        "text-secondary": "#94A3B8",
        "text-tertiary": "#64748B",
        "accent-knowledge": "#F59E0B",
        "accent-memory": "#A855F7",
        "accent-tasks": "#06B6D4",
        "accent-danger": "#EF4444",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
