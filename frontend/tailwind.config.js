/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand blues (from logo)
        blue: {
          50:  "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#1A73C8",  // primary brand blue
          600: "#1565C0",
          700: "#1153A8",
          800: "#0D3F82",
          900: "#0B2D5E",
        },
        // Brand greens (from logo)
        green: {
          50:  "#F0FDF4",
          100: "#DCFCE7",
          200: "#BBF7D0",
          300: "#86EFAC",
          400: "#6BC96B",
          500: "#3DAA4A",  // primary brand green
          600: "#2E8B3A",
          700: "#1F6B2A",
          800: "#145220",
          900: "#0A3A16",
        },
        // Gradient stops
        brand: {
          blue:  "#1A73C8",
          green: "#3DAA4A",
          teal:  "#0EA5A0",
        },
        // Neutrals
        navy:  "#0B2545",
        slate: {
          50:  "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        }
      },
      fontFamily: {
        sans:    ["DM Sans", "sans-serif"],
        display: ["Fraunces", "serif"],
      },
      borderRadius: {
        xl:  "14px",
        "2xl": "20px",
        "3xl": "28px",
      },
      boxShadow: {
        card:  "0 4px 24px rgba(11,37,69,0.10)",
        hover: "0 12px 48px rgba(11,37,69,0.16)",
        blue:  "0 4px 16px rgba(26,115,200,0.30)",
        green: "0 4px 16px rgba(61,170,74,0.30)",
      },
      backgroundImage: {
        "brand-gradient":   "linear-gradient(135deg, #1A73C8 0%, #0EA5A0 50%, #3DAA4A 100%)",
        "hero-gradient":    "linear-gradient(160deg, #FFFFFF 0%, #EFF6FF 60%, #DBEAFE 100%)",
        "section-gradient": "linear-gradient(135deg, #0B2545 0%, #1A73C8 100%)",
      },
    },
  },
  plugins: [],
};
