import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        charcoal: "#0B0D0C",
        graphite: "#111412",
        paper: "#D9A441",
        bone: "#F7F1E4",
        ink: "#17201d",
        moss: "#50695f",
        mint: "#dcefe3",
        clay: "#b16f54",
        amber: "#f4c76b",
        skywash: "#d9e7ef"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(23, 32, 29, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
