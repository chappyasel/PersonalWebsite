/**
 * Utilities for OG image generation
 */

import { enhanceCoverUrl } from "./coverUtils";

/**
 * Truncate title to fit within OG image (approximately 2 lines at 48px)
 * @param title - The book title
 * @param maxLength - Maximum character length (default 80)
 * @returns Truncated title with ellipsis if needed
 */
export function truncateTitle(title: string, maxLength = 80): string {
  if (title.length <= maxLength) {
    return title;
  }
  return title.substring(0, maxLength - 1).trim() + "…";
}

/**
 * Generate a styled SVG placeholder for books without covers
 * @param title - The book title to display
 * @returns SVG data URI
 */
export function generateFallbackCoverSvg(title: string): string {
  const truncatedTitle = truncateTitle(title, 50);
  const lines = wrapText(truncatedTitle, 20); // ~20 chars per line for 240px width

  const svgContent = `
    <svg width="240" height="360" xmlns="http://www.w3.org/2000/svg">
      <rect width="240" height="360" fill="rgb(229, 229, 229)"/>
      <text
        x="50%"
        y="50%"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="18"
        font-weight="600"
        fill="rgb(115, 115, 115)"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        ${lines.map((line, i) =>
          `<tspan x="50%" dy="${i === 0 ? 0 : 24}">${escapeXml(line)}</tspan>`
        ).join('')}
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`;
}

/**
 * Wrap text into multiple lines
 * @param text - The text to wrap
 * @param maxCharsPerLine - Maximum characters per line
 * @returns Array of text lines
 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // Limit to 4 lines for vertical centering
  return lines.slice(0, 4);
}

/**
 * Escape XML special characters
 * @param text - The text to escape
 * @returns Escaped text
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Fetch external image with timeout and error handling
 * @param url - The image URL to fetch
 * @param timeoutMs - Timeout in milliseconds (default 5000)
 * @returns ArrayBuffer of the image or null if failed
 */
export async function fetchExternalImage(
  url: string | null,
  timeoutMs = 5000,
): Promise<ArrayBuffer | null> {
  if (!url) {
    return null;
  }

  try {
    // Enhance cover URL quality if it's from Google Books
    const enhancedUrl = enhanceCoverUrl(url) ?? url;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(enhancedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BookOGImageBot/1.0)",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.arrayBuffer();
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error fetching external image: ${error.message}`);
    }
    return null;
  }
}

/**
 * Convert ArrayBuffer to base64 data URI
 * @param buffer - The image buffer
 * @param mimeType - The MIME type (default: image/jpeg)
 * @returns Base64 data URI
 */
export function arrayBufferToDataUri(
  buffer: ArrayBuffer,
  mimeType = "image/jpeg",
): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Determine if a title is long and needs size adjustment
 * @param title - The book title
 * @returns Object with fontSize and whether to truncate
 */
export function getTitleStyle(title: string): {
  fontSize: number;
  shouldTruncate: boolean;
} {
  if (title.length > 80) {
    return { fontSize: 40, shouldTruncate: true };
  } else if (title.length > 50) {
    return { fontSize: 44, shouldTruncate: false };
  }
  return { fontSize: 48, shouldTruncate: false };
}
