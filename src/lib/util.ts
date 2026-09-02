import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getDevPort() {
  if (typeof window !== "undefined") return window.location.port || "3000";
  return process.env.PORT ?? "3000";
}

/** Local dev base URL for the root domain (e.g. http://localhost:3001) */
export function devBaseUrl() {
  return `http://localhost:${getDevPort()}`;
}

/** Local dev base URL for a subdomain (e.g. http://books.localhost:3001) */
export function devSubdomainUrl(subdomain: string) {
  return `http://${subdomain}.localhost:${getDevPort()}`;
}

export function getTimeAgo(pubDate: string) {
  const now = new Date();
  const postDate = new Date(pubDate);
  const diffInDays = Math.floor(
    (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffInDays <= 0) {
    return "today";
  } else if (diffInDays >= 365) {
    const years = Math.floor(diffInDays / 365);
    return `${years} year${years > 1 ? "s" : ""} ago`;
  } else if (diffInDays >= 30) {
    const months = Math.floor(diffInDays / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  } else {
    return `${diffInDays} day${diffInDays !== 1 ? "s" : ""} ago`;
  }
}

/** Compact "how long ago" for freshness indicators: 42m ago, 3h ago, 6d ago. */
export function formatRelativeTime(date: Date | string) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}
