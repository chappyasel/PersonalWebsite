import type { StacksData } from "../../data";
import type { Palette } from "../../theme";

export type UnitProps = {
  data: StacksData;
  palette: Palette;
  dark: boolean;
  index: number;
  headOnCapture: boolean;
  coverWidth: 256 | 384;
  /** Opens a book the scene already holds in full (`data.shelfBooks`). */
  onOpenBook?: (bookId: string) => void;
  /** Opens any library book by id, fetched by the books app on the way in.
   * Packed spines use this: they are real reads the homepage payload
   * deliberately does not carry whole. */
  onOpenBookId?: (bookId: string) => void;
  onOpenUrl?: (url: string) => void;
};
