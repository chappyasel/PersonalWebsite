import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getTimeAgo(pubDate: string) {
  const now = new Date();
  const postDate = new Date(pubDate);
  const diffInDays = Math.floor(
    (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffInDays >= 365) {
    const years = Math.floor(diffInDays / 365);
    return `${years} year${years > 1 ? "s" : ""} ago`;
  } else if (diffInDays >= 30) {
    const months = Math.floor(diffInDays / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  } else {
    return `${diffInDays} day${diffInDays !== 1 ? "s" : ""} ago`;
  }
}
