import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mtg: {
          white: "#F9FAF4",
          blue: "#0E68AB",
          black: "#21201E",
          red: "#D3202A",
          green: "#00733E",
          gold: "#C8A200",
          land: "#8C6B45",
        },
      },
    },
  },
  plugins: [],
};

export default config;
