import type { StacksData } from "../data";
import { ABOUT_ROLES } from "../scene/aboutRoleIcons";
import {
  type PropDestination,
  destinationFor,
} from "../scene/interactionRegistry";

export type IllustrationLabel = {
  id: string;
  title: string;
  detail?: readonly string[];
  action?: string;
  href?: string;
  external?: boolean;
  destination?: PropDestination;
  bookId?: string;
};

function destination(id: string, to: PropDestination): IllustrationLabel {
  const target = destinationFor(to);
  return {
    id,
    title: target.label,
    action: target.actionLabel,
    href: target.href,
    external: target.external,
    destination: to,
  };
}

/** Labels belong to visible artwork identities, never to array positions in live data.
 * Local effects that require a renderer keep their context without an action. */
export function illustrationLabel(
  unit: number,
  id: string,
  data: StacksData,
  bookAction: string,
): IllustrationLabel | null {
  const bookId = id.startsWith("stacks-cover-")
    ? id.slice("stacks-cover-".length)
    : id.startsWith("reading-book:")
      ? id.slice("reading-book:".length)
      : null;
  if (bookId) {
    const book = [
      ...(data.readingBooks ?? []),
      ...(data.featuredBooks ?? []),
      ...(data.spineBooks ?? []),
    ].find((book) => book.id === bookId);
    // Archived art can outlive a library selection. Do not attach another
    // book's notes to its cover, or promise a book absent from current data.
    return book
      ? {
          id,
          title: book.title,
          detail: book.author ? [book.author] : [],
          action: bookAction,
          bookId,
        }
      : null;
  }
  if (unit === 0) {
    const role = ABOUT_ROLES.find((role) => id === `role:${role.id}`);
    if (role)
      return {
        id,
        title: role.portalLabel,
        detail: role.portalDetail,
        href: role.href,
        action: "View site",
        external: true,
      };
    switch (id) {
      case "coordination-globe":
        return {
          id,
          title: "Coordination Research",
          href: "https://coordination.sh/",
          action: "View site",
          external: true,
        };
      case "globe":
        return { id, title: "Globe" };
      case "vision-pro":
        return {
          id,
          title: "Apple",
          detail: ["Former AI/ML, AR/VR Software Engineer"],
        };
      case "ai-collective":
        return {
          id,
          title: "The AI Collective",
          detail: ["Founder & Chairman"],
          href: "https://aicollective.com/",
          action: "View site",
          external: true,
        };
      case "tj-medallion":
        return {
          id,
          title: "Thomas Jefferson High School for Science & Technology",
          detail: [
            "Class of 2017",
            "Alumni Director, TJ Partnership Fund board",
          ],
          href: "https://tjhsst.fcps.edu/",
          action: "View site",
          external: true,
        };
      case "dumbbell":
        return destination(id, "weightlifting");
    }
  }
  if (unit === 1 && id.startsWith("books-packed-"))
    return destination(id, "books");
  if (unit === 2 && id.startsWith("grab-dumbbell-training-"))
    return destination(id, "weightlifting");
  if (unit === 3) {
    if (id === "systems-manual-row") return destination(id, "manual");
    if (id === "link-routineboard") return destination(id, "routine");
  }
  if (unit === 4) {
    if (id.startsWith("link-projects-dice-"))
      return destination(id, "liarsdice");
    const titles: Record<string, string> = {
      "action-projects-weightlifting": "Weightlifting App",
      "action-projects-homework": "Homework App",
      mac: "Macintosh",
      arduino: "Arduino Uno",
      card: "Circuit board",
    };
    if (titles[id]) return { id, title: titles[id] };
    if (id === "shimmer-apple")
      return { id, title: "Apple", detail: ["Former AR/VR Software Engineer"] };
  }
  if (unit === 5) {
    if (id === "grab-headphones")
      return {
        id,
        title: "Chappy's Music",
        action: "Listen on SoundCloud",
        href: "https://soundcloud.com/chappyasel",
        external: true,
      };
    if (id === "grab-openbook" || id === "musings-book-row")
      return destination(id, "books");
    if (id === "grab-trust-essay-musings")
      return {
        id,
        title: "Trust in the Age of Acceleration",
        action: "Read article",
        href: "https://www.aicollective.com/trust",
        external: true,
      };
  }
  return null;
}
