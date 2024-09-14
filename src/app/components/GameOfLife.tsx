"use client";

import { useEffect, useRef } from "react";

// https://plato.stanford.edu/entries/cellular-automata/supplement.html
const COOL_RULES = [22, 30, 45, 73, 86, 105, 150];
const RULE = COOL_RULES[Math.floor(Math.random() * COOL_RULES.length)]!;

// When to switch from cellular automata (1D) to game of life (2D)
const GAME_OF_LIFE_START = 0.25;
const FPS = 6;
const DEFAULT_SIZE = 18;
const MIN_NUM_ROWS_COLS = 81;

const FONT = "Cofactory, monospace";

const LETTERS = [
  ["X", "X", "X"],
  ["X", "X", "X"],
  ["X", "X", "X"],
];
const COLOR = [
  ["#ff0000", "#ff00ff", "#8000ff"],
  ["#ff8000", "#ffffff", "#0000ff"],
  ["#ffff00", "#00ff00", "#00ffff"],
];
const GRAYSCALE = [
  ["#404040", "#606060", "#505050"],
  ["#505050", "#707070", "#404040"],
  ["#606060", "#404040", "#606060"],
];

const ON_ALPHA = 0.2;
const ON_COLORS = COLOR;
const OFF_ALPHA = 0.01;
const OFF_COLORS = GRAYSCALE;

const LETTER_RELATIVE_SIZE = 40;
const LETTER_RELATIVE_SPACING = 12;

export default function GameOfLife() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const NUM_ROWS = Math.max(
      MIN_NUM_ROWS_COLS,
      Math.floor(window.innerHeight / DEFAULT_SIZE),
    );
    const NUM_COLS = Math.max(
      MIN_NUM_ROWS_COLS,
      Math.floor(window.innerWidth / DEFAULT_SIZE),
    );
    const GOL_START = Math.floor(NUM_ROWS * GAME_OF_LIFE_START);

    const kernel = new Array(8).fill(0).map((_, i) => (RULE >> i) & 1);
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
      const currentRow = matrix[NUM_ROWS - 1]!;
      const nextRow = [];

      for (let c = 0; c < NUM_COLS; c++) {
        const left = currentRow[(c - 1 + NUM_COLS) % NUM_COLS] ?? 0;
        const center = currentRow[c]!;
        const right = currentRow[(c + 1) % NUM_COLS] ?? 0;
        nextRow[c] = kernel[left * 4 + center * 2 + right]!;
      }

      for (let r = GOL_START; r < NUM_ROWS - 1; r++) {
        matrix[r] = matrix[r + 1]!;
      }
      matrix[NUM_ROWS - 1] = nextRow;

      // Handle game of life for rows 0 to GOL_START
      const numNeighbors: number[][] = [];

      for (let r = 0; r <= GOL_START; r++) {
        numNeighbors[r] = [];
        for (let c = 0; c < NUM_COLS; c++) {
          numNeighbors[r]![c] = 0;
        }
      }

      for (let r = 1; r <= GOL_START; r++) {
        for (let c = 0; c < NUM_COLS; c++) {
          if (matrix[r]![c] !== 1) continue;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) {
                continue;
              }
              const nr = (r + dr + NUM_ROWS) % NUM_ROWS;
              const nc = (c + dc + NUM_COLS) % NUM_COLS;
              if (nr >= 0 && nr < GOL_START + 1) {
                numNeighbors[nr]![nc]! += 1;
              }
            }
          }
        }
      }

      for (let r = 0; r <= GOL_START; r++) {
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
        Array.from({ length: NUM_COLS }, () => 0),
      );
      matrix[NUM_ROWS - 1]![Math.floor(NUM_COLS / 2)] = 1;
      return matrix;
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pixelated fixed block size-full bg-white"
    />
  );
}
