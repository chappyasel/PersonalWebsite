/** Remove unused line width after wrapping, without changing the line breaks. */
export function fitPortalLabelText(text: HTMLElement) {
  text.style.removeProperty("width");
  const available = Number.parseFloat(getComputedStyle(text).width);
  const renderedWidth = text.getBoundingClientRect().width;
  if (!(available > 0) || !(renderedWidth > 0)) return;

  // Range rectangles include the tooltip's entrance scale; CSS widths do not.
  const scale = renderedWidth / available;
  const range = document.createRange();
  let longestLine = 0;
  for (const line of text.children) {
    range.selectNodeContents(line);
    for (const rect of Array.from(range.getClientRects())) {
      longestLine = Math.max(longestLine, rect.width / scale);
    }
  }
  if (longestLine > 0) {
    // Leave a pixel for subpixel font rounding so no word wraps again.
    text.style.width = `${Math.min(available, Math.ceil(longestLine) + 1)}px`;
  }
}
