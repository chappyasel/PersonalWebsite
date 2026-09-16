import { createElement } from "react";
import satori from "satori";

// 1200px card minus two 60px gutters, the 307px cover, and a 60px gap.
export const BOOK_OG_TITLE_WIDTH = 713;
export const BOOK_OG_TITLE_LINE_HEIGHT = 1.125;

/** Find the largest readable size that fits the actual font in two lines. */
export async function getBookOgTitleSize(
  title: string,
  font: ArrayBuffer,
): Promise<number> {
  const fits = async (fontSize: number) => {
    let height = Infinity;
    await satori(
      createElement(
        "h1",
        {
          style: {
            width: BOOK_OG_TITLE_WIDTH,
            fontFamily: "Georgia Pro",
            fontSize,
            fontWeight: 700,
            margin: 0,
            lineHeight: BOOK_OG_TITLE_LINE_HEIGHT,
            // Count an overwide word as extra lines, rather than overflow.
            wordBreak: "break-word",
          },
        },
        title,
      ),
      {
        width: BOOK_OG_TITLE_WIDTH,
        embedFont: false,
        fonts: [
          { name: "Georgia Pro", data: font, weight: 700, style: "normal" },
        ],
        onNodeDetected: (node) => {
          if (node.type === "h1") height = node.height;
        },
      },
    );
    // Yoga rounds line boxes up to whole pixels.
    return height <= Math.ceil(fontSize * BOOK_OG_TITLE_LINE_HEIGHT) * 2;
  };

  let low = 48;
  let high = 96;
  if (await fits(high)) return high;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    if (await fits(candidate)) low = candidate;
    else high = candidate - 1;
  }
  // Exceptionally long titles retain the two-line clamp at the minimum size.
  return low;
}
