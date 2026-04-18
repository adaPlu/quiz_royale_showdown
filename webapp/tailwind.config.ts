import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6C3EF5",
          gold: "#FFD700",
          bg: "#0E0E1A",
          panel: "#18182A",
          accent: "#9B7BFF"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        royale: "0 24px 80px rgba(108, 62, 245, 0.35)"
      },
      keyframes: {
        "pulse-ring": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "50%": { transform: "scale(1.04)", opacity: "1" }
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "pulse-ring": "pulse-ring 1.2s ease-in-out infinite",
        "slide-up": "slide-up 0.35s ease-out"
      }
    }
  },
  plugins: []
} satisfies Config;
