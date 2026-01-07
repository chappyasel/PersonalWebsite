/**
 * Utilities for OG image generation
 */
import sharp from "sharp";

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
  const lines = wrapText(truncatedTitle, 18); // Adjusted for 280px width

  const svgContent = `
    <svg width="280" height="420" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="420" fill="rgb(229, 229, 229)"/>
      <text
        x="50%"
        y="50%"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="20"
        font-weight="600"
        fill="rgb(115, 115, 115)"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        ${lines
          .map(
            (line, i) =>
              `<tspan x="50%" dy="${i === 0 ? 0 : 26}">${escapeXml(line)}</tspan>`,
          )
          .join("")}
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
      console.error(
        `Failed to fetch image: ${response.status} ${response.statusText}`,
      );
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
 * Updated for larger font sizes (roughly 2x original)
 * @param title - The book title
 * @returns Object with fontSize and whether to truncate
 */
export function getTitleStyle(title: string): {
  fontSize: number;
  shouldTruncate: boolean;
} {
  if (title.length > 80) {
    return { fontSize: 70, shouldTruncate: true };
  } else if (title.length > 50) {
    return { fontSize: 82, shouldTruncate: false };
  }
  return { fontSize: 96, shouldTruncate: false };
}

/**
 * Calculate average RGB color from image buffer
 * Uses sharp to analyze image and extract average color
 * @param imageBuffer - The image data as ArrayBuffer
 * @returns Average RGB values or null if analysis fails
 */
export async function getAverageImageColor(
  imageBuffer: ArrayBuffer,
): Promise<{ r: number; g: number; b: number } | null> {
  try {
    // Convert ArrayBuffer to Buffer for sharp
    const buffer = Buffer.from(imageBuffer);

    // Get image stats using sharp
    const { dominant } = await sharp(buffer).stats();

    return {
      r: dominant.r,
      g: dominant.g,
      b: dominant.b,
    };
  } catch (error) {
    console.error("Error analyzing image color:", error);
    return null;
  }
}

/**
 * Calculate relative luminance using WCAG formula
 * Returns value between 0 (darkest) and 1 (lightest)
 * @param r - Red value (0-255)
 * @param g - Green value (0-255)
 * @param b - Blue value (0-255)
 * @returns Luminance value between 0 and 1
 */
export function calculateLuminance(r: number, g: number, b: number): number {
  // Convert RGB to sRGB
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;

  // Apply gamma correction
  const rLinear =
    rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLinear =
    gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLinear =
    bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  // WCAG luminance formula
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Determine text color and overlay based on image brightness
 * @param luminance - Relative luminance (0-1)
 * @returns Text color and overlay color for optimal contrast
 */
export function getTextColorAndOverlay(luminance: number): {
  textColor: string;
  overlayColor: string;
} {
  // Threshold: 0.5 is medium gray
  const isLight = luminance > 0.5;

  return {
    textColor: isLight ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)",
    overlayColor: isLight
      ? "rgba(255, 255, 255, 0.7)" // Light overlay for light images
      : "rgba(0, 0, 0, 0.7)", // Dark overlay for dark images
  };
}
