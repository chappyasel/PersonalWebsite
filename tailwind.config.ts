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
        background: "rgb(250, 250, 250)",
        nav: "rgb(250, 250, 250)",
        navText: "rgb(80, 80, 80)",
        navHover: "rgb(150, 150, 150)",
        title: "rgb(80, 80, 80)",
        body: "rgb(120, 120, 120)",
        cell: "rgb(242, 242, 242)",
      },
    },
  },
  plugins: [],
} satisfies Config;
