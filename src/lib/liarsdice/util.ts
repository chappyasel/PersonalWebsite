export function expectedValue(total: number): string {
  const val = (total / 3).toFixed(0);
  switch (total % 3) {
    case 1:
      return `over ${val}`;
    case 2:
      return `under ${val}`;
    default:
      return `${val}`;
  }
}

export function numberToString(num: number): string {
  switch (num) {
    case 0:
      return "Ones";
    case 1:
      return "Twos";
    case 2:
      return "Threes";
    case 3:
      return "Fours";
    case 4:
      return "Fives";
    case 5:
      return "Sixes";
    default:
      return "Unknown";
  }
}
