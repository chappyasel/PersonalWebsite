import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["SF Pro Display", ...fontFamily.sans],
      },
      colors: {
        background: "rgb(250, 240, 230)",
        title: "rgb(120, 110, 100)",
        body: "rgb(120, 110, 100)",
        cell: "rgb(250, 240, 230)",
      },
    },
  },
  plugins: [],
} satisfies Config;
