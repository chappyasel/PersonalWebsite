import type { StacksData } from "../../data";
import type { Palette } from "../../theme";

export type UnitProps = {
  data: StacksData;
  palette: Palette;
  index: number;
  coverWidth: 256 | 384;
  onOpenBook?: (bookId: string) => void;
  onOpenUrl?: (url: string) => void;
};
