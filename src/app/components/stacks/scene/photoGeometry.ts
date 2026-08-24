export const DESK_FRAME_BORDER = 0.024;
export const DESK_FRAME_MAT_INSET = 0.006;

export function deskFrameWidth(width: number) {
  return width + DESK_FRAME_BORDER * 2;
}

export function deskFrameHeight(height: number) {
  return height + DESK_FRAME_BORDER * 2;
}
