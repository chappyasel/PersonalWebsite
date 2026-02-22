import {
  DiceFive,
  DiceFour,
  DiceOne,
  DiceSix,
  DiceThree,
  DiceTwo,
} from "@phosphor-icons/react";

const DICE_ICONS = [DiceOne, DiceTwo, DiceThree, DiceFour, DiceFive, DiceSix];

interface DiceFaceProps {
  value: number; // 1-6
  className?: string;
}

export default function DiceFace({ value, className = "" }: DiceFaceProps) {
  const Icon = DICE_ICONS[value - 1];
  if (!Icon) return null;
  return <Icon className={className} weight="duotone" />;
}
