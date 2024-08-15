"use client";

import { useEffect, useRef } from "react";

const FPS = 1.0;
const DEFAULT_SIZE = 18;
const MIN_NUM_ROWS_COLS = 81;

const FONT = "Cofactory, monospace";

const LETTERS = [
  ["O", "X", "~"],
  ["!", "+", "X"],
  [":", "Z", "V"],
];
const COLOR = [
  ["#FFCCCC", "#FFCCFF", "#CCCCFF"],
  ["#FFCC99", "#CCCCCC", "#9999FF"],
  ["#FFFF99", "#99FF99", "#99FFFF"],
];
const GRAYSCALE = [
  ["#FAFAFA", "#FAFAFA", "#FAFAFA"],
  ["#FAFAFA", "#FAFAFA", "#FAFAFA"],
  ["#FAFAFA", "#FAFAFA", "#FAFAFA"],
];

const ON_ALPHA = 0.2;
const ON_COLORS = COLOR;
const OFF_ALPHA = 1.0;
const OFF_COLORS = GRAYSCALE;

const LETTER_RELATIVE_SIZE = 40;
const LETTER_RELATIVE_SPACING = 12;

export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastInvokeTime = useRef<number>(0);

  useEffect(() => {
    if (Date.now() - lastInvokeTime.current < 1000.0 / FPS) return;
    lastInvokeTime.current = Date.now();

    const NUM_ROWS = Math.max(
      MIN_NUM_ROWS_COLS,
      Math.floor(window.innerHeight / DEFAULT_SIZE),
    );
    const NUM_COLS = Math.max(
      MIN_NUM_ROWS_COLS,
      Math.floor(window.innerWidth / DEFAULT_SIZE),
    );

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let gridScale = 1;
    let gridSize = LETTER_RELATIVE_SIZE * gridScale;
    let gridSpacing = LETTER_RELATIVE_SPACING * gridScale;
    let font = "bold " + (gridSize - gridSpacing) + "px " + FONT;
    let offsetX = 0;
    let offsetY = 0;
    const matrix: number[][] = initializeMatrix();

    function viewportResized() {
      const ratio = 3; // Math.ceil(window.devicePixelRatio)
      canvas.width = window.innerWidth * ratio;
      canvas.height = window.innerHeight * ratio;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      const scaleX = canvas.width / (NUM_COLS * LETTER_RELATIVE_SIZE);
      const scaleY = canvas.height / (NUM_ROWS * LETTER_RELATIVE_SIZE);
      gridScale = Math.max(scaleX, scaleY);

      gridSize = LETTER_RELATIVE_SIZE * gridScale;
      gridSpacing = LETTER_RELATIVE_SPACING * gridScale;
      font = "bold " + (gridSize - gridSpacing) + "px " + FONT;

      offsetX = (canvas.width - gridSize * NUM_COLS) / 2;
      offsetY = canvas.height - gridSize * (NUM_ROWS - 1);
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let r = 0; r < NUM_ROWS; r++) {
        for (let c = 0; c < NUM_COLS; c++) {
          const x = c * gridSize + offsetX;
          const y = r * gridSize + offsetY;

          ctx.font = font;
          if (matrix[r]![c] === 1) {
            ctx.fillStyle = ON_COLORS[r % 3]![c % 3]!;
            ctx.globalAlpha = ON_ALPHA;
          } else {
            ctx.fillStyle = OFF_COLORS[r % 3]![c % 3]!;
            ctx.globalAlpha = OFF_ALPHA;
          }
          ctx.fillText(LETTERS[r % 3]![c % 3]!, x, y);
        }
      }
      updateMatrix();
    }

    function updateMatrix() {
      const numNeighbors: number[][] = [];

      for (let r = 0; r < NUM_ROWS; r++) {
        numNeighbors[r] = [];
        for (let c = 0; c < NUM_COLS; c++) {
          numNeighbors[r]![c] = 0;
        }
      }

      for (let r = 0; r < NUM_ROWS; r++) {
        for (let c = 0; c < NUM_COLS; c++) {
          if (matrix[r]![c] !== 1) continue;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) {
                continue;
              }
              const nr = (r + dr + NUM_ROWS) % NUM_ROWS;
              const nc = (c + dc + NUM_COLS) % NUM_COLS;
              if (nr >= 0 && nr < NUM_ROWS) {
                numNeighbors[nr]![nc]! += 1;
              }
            }
          }
        }
      }

      for (let r = 0; r < NUM_ROWS; r++) {
        for (let c = 0; c < NUM_COLS; c++) {
          if (matrix[r]![c] === 1) {
            if (numNeighbors[r]![c]! < 2 || numNeighbors[r]![c]! > 3) {
              matrix[r]![c] = 0;
            }
          } else if (numNeighbors[r]![c] === 3) {
            matrix[r]![c] = 1;
          }
        }
      }
    }

    viewportResized();
    window.addEventListener("resize", () => {
      viewportResized();
    });

    setInterval(draw, 1000 / FPS);

    function initializeMatrix(): number[][] {
      const matrix: number[][] = Array.from({ length: NUM_ROWS }, () =>
        Array.from({ length: NUM_COLS }, () => (Math.random() > 0.5 ? 1 : 0)),
      );
      return matrix;
    }

    return () => {
      window.removeEventListener("resize", () => {
        viewportResized();
      });
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pixelated fixed block size-full bg-background"
    />
  );
}
