/** WebGL readback is bottom-up, premultiplied RGBA; Canvas expects straight alpha. */
export function canvasPixels(pixels, width, height) {
  if (pixels.length !== width * height * 4)
    throw Error("Readback dimensions mismatch");
  const data = new Uint8ClampedArray(pixels.length),
    stride = width * 4;
  for (let row = 0; row < height; row++)
    data.set(
      pixels.subarray((height - row - 1) * stride, (height - row) * stride),
      row * stride,
    );
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha > 0 && alpha < 255)
      for (let c = 0; c < 3; c++)
        data[i + c] = Math.min(255, Math.round((data[i + c] * 255) / alpha));
  }
  return data;
}
