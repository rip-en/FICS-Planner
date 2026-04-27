import type { Config } from "tailwindcss";
import containerQuery from "@tailwindcss/container-queries";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  plugins: [containerQuery],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1115",
          raised: "#151821",
          border: "#262b36",
        },
        brand: {
          DEFAULT: "#f9a825",
          dim: "#c17c00",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
};

export default config;
