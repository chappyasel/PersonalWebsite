import {
  ArrowLeft,
  Barbell,
  ChartLineUp,
  SignOut,
  Table,
  Target,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { cn } from "~/lib/utils";

import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { signOutOwner } from "./actions";
import { type EditorView, WEEKS_CONTROLS_ID } from "./headerSlot";

const VIEWS: readonly {
  view: EditorView;
  href: string;
  label: string;
  Icon: typeof Table;
}[] = [
  { view: "weeks", href: "/weight-log/edit", label: "Weeks", Icon: Table },
  {
    view: "plan",
    href: "/weight-log/edit/plan",
    label: "Plan",
    Icon: ChartLineUp,
  },
  {
    view: "set-points",
    href: "/weight-log/edit/set-points",
    label: "Set points",
    Icon: Target,
  },
];

/** Phones show icons only, so their names live in a Tooltip there. */
const NAV_BUTTON = "h-9 w-9 gap-1.5 px-0 sm:w-auto sm:px-3";

/**
 * The editor's top nav. The title goes to the public chart, with the same
 * icon the chart's own title has, which turns into an arrow on hover. The
 * links switch between the Weeks table, Plan, and Set points, which are
 * pages rather than sheets, so a phone never gets a modal. On the Weeks page
 * the table puts its phase picker and Go to date in the slot here: one row
 * on a wide screen, a second row on a phone.
 */
export function EditorHeader({ view }: { view: EditorView }) {
  return (
    <TooltipProvider delayDuration={200}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0">
          <Link
            href="/weight-log"
            prefetch={false}
            aria-label="Weight Log, back to the chart"
            className="group inline-flex min-w-0 max-w-full items-center gap-2 rounded-md text-2xl font-semibold text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-4xl"
          >
            <span
              aria-hidden
              className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center md:h-9 md:w-9"
            >
              <Barbell
                weight="bold"
                className="absolute h-7 w-7 transition-all duration-200 group-hover:scale-75 group-hover:opacity-0 group-focus-visible:scale-75 group-focus-visible:opacity-0 motion-reduce:transition-none md:h-9 md:w-9"
              />
              <ArrowLeft
                weight="bold"
                className="absolute h-7 w-7 scale-75 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:transition-none md:h-9 md:w-9"
              />
            </span>
            <span className="truncate font-rounded">Weight Log</span>
          </Link>
        </h1>
        {view === "weeks" ? (
          <div
            id={WEEKS_CONTROLS_ID}
            className="order-last flex w-full min-w-0 items-center gap-2 empty:hidden lg:order-none lg:ml-auto lg:w-auto"
          />
        ) : null}
        <nav
          aria-label="Weight Log editor"
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1",
            view === "weeks" && "lg:ml-0",
          )}
        >
          {VIEWS.map(({ view: page, href, label, Icon }) => (
            <Tooltip key={page}>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className={cn(
                    NAV_BUTTON,
                    page === view && "bg-accent text-accent-foreground",
                  )}
                >
                  <Link
                    href={href}
                    aria-label={label}
                    aria-current={page === view ? "page" : undefined}
                  >
                    <Icon aria-hidden weight="bold" className="h-5 w-5" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">{label}</TooltipContent>
            </Tooltip>
          ))}
          {/* Icon only at every width: the owner rarely signs out. */}
          <form action={signOutOwner}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label="Sign out"
                >
                  <SignOut aria-hidden className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </form>
        </nav>
      </header>
    </TooltipProvider>
  );
}
