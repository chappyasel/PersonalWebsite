import localFont from "next/font/local";

export const georgiaPro = localFont({
  src: [
    {
      path: "./GeorgiaPro-Light.ttf",
      weight: "300",
      style: "normal",
    },
    {
      path: "./GeorgiaPro-LightItalic.ttf",
      weight: "300",
      style: "italic",
    },
    {
      path: "./GeorgiaPro-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./GeorgiaPro-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "./GeorgiaPro-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "./GeorgiaPro-SemiBoldItalic.ttf",
      weight: "600",
      style: "italic",
    },
    {
      path: "./GeorgiaPro-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "./GeorgiaPro-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
    {
      path: "./GeorgiaPro-Black.ttf",
      weight: "900",
      style: "normal",
    },
    {
      path: "./GeorgiaPro-BlackItalic.ttf",
      weight: "900",
      style: "italic",
    },
  ],
  variable: "--font-georgia-pro",
  display: "swap",
});
