/**
 * Georgia Pro font loading for book OG images
 * Fonts are loaded from /public/fonts/ via fetch for Vercel compatibility
 */

// Cache for loaded fonts
let georgiaProBoldCache: ArrayBuffer | null = null;
let georgiaProRegularCache: ArrayBuffer | null = null;

function getBaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return "https://chappyasel.com";
  }
  return "http://localhost:3000";
}

export async function loadGeorgiaProBold(): Promise<ArrayBuffer> {
  if (georgiaProBoldCache) return Promise.resolve(georgiaProBoldCache);

  const response = await fetch(`${getBaseUrl()}/fonts/GeorgiaPro-Bold.ttf`);
  georgiaProBoldCache = await response.arrayBuffer();
  return georgiaProBoldCache;
}

export async function loadGeorgiaProRegular(): Promise<ArrayBuffer> {
  if (georgiaProRegularCache) return Promise.resolve(georgiaProRegularCache);

  const response = await fetch(`${getBaseUrl()}/fonts/GeorgiaPro-Regular.ttf`);
  georgiaProRegularCache = await response.arrayBuffer();
  return georgiaProRegularCache;
}
