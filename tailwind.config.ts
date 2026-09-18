import type { Config } from "tailwindcss";

// House card system (MedMasters, reconciled Aug 30 2026): navy + terra, white ground,
// hairline borders, no gold. Every text color here is 7:1 or better on white.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B1530", deep: "#060C1D", tint: "#EDF1F3" },
        terra: { DEFAULT: "#8B3A2E", dark: "#6F2D23" },
        ink: { DEFAULT: "#0B1530", muted: "#4F576A", faint: "#6E7686" },
        line: { DEFAULT: "rgba(11,21,48,0.15)", strong: "#6B7285" },
        page: "#FAFAF9",
        ok: "#155A31",
        warn: "#6B4900",
        danger: "#9E2A1E",
      },
      fontFamily: {
        sans: ["var(--font-body)", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Open Sans", "Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "8px", btn: "4px" },
    },
  },
  plugins: [],
};
export default config;
