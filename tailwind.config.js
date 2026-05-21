/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cyan/turquesa del logo de Cyber 7 (la "C" superior)
        marca: {
          50: "#ecfafb",
          100: "#cef3f5",
          200: "#a4e7ec",
          300: "#6cd6dd",
          400: "#34c0c8",
          500: "#1fb5bd",
          600: "#189ba2",
          700: "#157d83",
          800: "#14646a",
          900: "#145056",
        },
        // Navy del logo (el "7" y el texto CYBER 7)
        navy: {
          50: "#f0f4f9",
          100: "#d5e0ee",
          200: "#aac0dc",
          300: "#7ba0c8",
          400: "#4f80b0",
          500: "#2e6092",
          600: "#1d4978",
          700: "#0f2f5f",
          800: "#0a2247",
          900: "#061634",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
