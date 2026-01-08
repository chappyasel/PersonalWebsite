/**
 * Georgia Pro font loading for book OG images
 * Fonts are loaded via import.meta.url for build-time compatibility
 */

// Font URLs
const georgiaBoldUrl = new URL("./fonts/GeorgiaPro-Bold.ttf", import.meta.url);
const georgiaRegularUrl = new URL(
  "./fonts/GeorgiaPro-Regular.ttf",
  import.meta.url,
);

// Font loaders
export async function loadGeorgiaProBold(): Promise<ArrayBuffer> {
  const response = await fetch(georgiaBoldUrl);
  return response.arrayBuffer();
}

export async function loadGeorgiaProRegular(): Promise<ArrayBuffer> {
  const response = await fetch(georgiaRegularUrl);
  return response.arrayBuffer();
}
