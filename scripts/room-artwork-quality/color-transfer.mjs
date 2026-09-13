const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));

/** A bounded monotone curve preserves texture detail and black ink. */
export function fitChannel(samples) {
  if (samples.length < 12) return { gain: 1, gamma: 1 };
  let best = { gain: 1, gamma: 1, loss: Infinity };
  for (let step = 0; step <= 100; step++) {
    const gamma = 0.6 + step * 0.02;
    let xy = 0,
      xx = 0;
    for (const [x, y] of samples) {
      const p = 255 * (x / 255) ** gamma;
      xy += p * y;
      xx += p * p;
    }
    let gain = Math.min(2, Math.max(0.1, xy / Math.max(1, xx)));
    // Robust refinement limits the influence of edges, reflections and shadows.
    for (let iteration = 0; iteration < 3; iteration++) {
      xy = 0;
      xx = 0;
      for (const [x, y] of samples) {
        const p = 255 * (x / 255) ** gamma,
          residual = Math.abs(Math.min(255, p * gain) - y);
        const weight = Math.min(1, 12 / Math.max(1, residual));
        xy += weight * p * y;
        xx += weight * p * p;
      }
      gain = Math.min(2, Math.max(0.1, xy / Math.max(1, xx)));
    }
    let loss = 0;
    for (const [x, y] of samples)
      loss += Math.abs(Math.min(255, 255 * (x / 255) ** gamma * gain) - y);
    if (loss < best.loss) best = { gain, gamma, loss };
  }
  return {
    gain: Number(best.gain.toFixed(6)),
    gamma: Number(best.gamma.toFixed(6)),
  };
}
export function channelValue(x, curve) {
  return clamp(255 * (x / 255) ** curve.gamma * curve.gain);
}
export function transferPixels(data, curves) {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    // Include antialiased edges so darker artwork gets no bright fringe.
    // Physically translucent owners are excluded before this function.
    if (out[i + 3] === 0) continue;
    for (let k = 0; k < 3; k++)
      out[i + k] = channelValue(out[i + k], curves[k]);
  }
  return out;
}

export const labelColor = (i) => (i * 1234567) & 0xffffff;
export const labelHex = (i) =>
  "#" + labelColor(i).toString(16).padStart(6, "0");
export const pixelColor = (data, i) =>
  (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
