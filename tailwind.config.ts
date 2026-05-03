import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        stage: {
          proposal: "hsl(var(--stage-proposal))",
          quotation: "hsl(var(--stage-quotation))",
          pending: "hsl(var(--stage-pending))",
          indigo: "hsl(var(--accent-indigo))",
          amber: "hsl(var(--accent-amber))",
          emerald: "hsl(var(--accent-emerald))",
          rose: "hsl(var(--accent-rose))",
          slate: "hsl(var(--accent-slate))",
          violet: "hsl(var(--accent-violet))",
          orange: "hsl(var(--accent-orange))",
          teal: "hsl(var(--accent-teal))",
          sky: "hsl(var(--accent-sky))",
          cyan: "hsl(var(--accent-cyan))",
          fuchsia: "hsl(var(--accent-fuchsia))",
        },
        urgent: "hsl(var(--urgent))",
        soon: "hsl(var(--soon))",
        brand: {
          navy: "hsl(var(--brand-navy))",
          "navy-soft": "hsl(var(--brand-navy-soft))",
          orange: "hsl(var(--brand-orange))",
          "orange-soft": "hsl(var(--brand-orange-soft))",
          gold: "hsl(var(--brand-gold))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Raleway", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Raleway", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-in": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "slide-in-right": { "0%": { transform: "translateX(100%)" }, "100%": { transform: "translateX(0)" } },
        "slide-in-left": { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(0)" } },
        "jiggle": {
          "0%, 100%":  { transform: "rotate(-1deg)" },
          "50%":       { transform: "rotate(1deg)" },
        },
        "nope-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%":      { transform: "translateX(-4px)" },
          "40%":      { transform: "translateX(4px)" },
          "60%":      { transform: "translateX(-3px)" },
          "80%":      { transform: "translateX(2px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-in-left": "slide-in-left 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        "jiggle": "jiggle 0.33s ease-in-out infinite",
        "nope-shake": "nope-shake 0.36s ease-in-out 1",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
