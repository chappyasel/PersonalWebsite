import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["Georgia", ...fontFamily.serif],
        sans: ["SF Pro Display", ...fontFamily.sans],
      },
      colors: {
        background: "rgb(245, 245, 245)",
        title: "rgb(115, 115, 115)",
        body: "rgb(115, 115, 115)",
        cell: "rgb(245, 245, 245)",
      },
    },
  },
  plugins: [require("tailwindcss-motion"), require("tailwindcss-intersect")],
} satisfies Config;
