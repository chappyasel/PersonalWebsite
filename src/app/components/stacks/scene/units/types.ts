import type { StacksData } from "../../data";
import type { Palette } from "../../theme";

export type UnitProps = {
  data: StacksData;
  palette: Palette;
  dark: boolean;
  index: number;
  headOnCapture: boolean;
  coverWidth: 256 | 384;
  onOpenBook?: (bookId: string) => void;
  onOpenUrl?: (url: string) => void;
};
