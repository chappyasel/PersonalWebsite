"use client";

import { type ReactNode, useEffect, useRef } from "react";

import AnchorLink from "~/components/daylight/AnchorLink";
import { SECTION_JUMP_EVENT } from "~/components/daylight/sectionJump";

/**
 * A content heading a link can land on. The id comes from the sync
 * (assignAnchors) or, for a snapshot that predates it, from the heading's
 * own words. A hover reveals the copy-link button the section headers
 * carry; arriving on the id scrolls the heading under the rail once the
 * folds around it (LayerSections, DaylightSection, NotionToggle, which all
 * open for a target inside them) have added their height.
 */
export default function AnchorHeading({
  as: Tag,
  id,
  children,
}: {
  as: "h2" | "h3";
  id: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    function handle() {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      const self = ref.current;
      if (!self || hash !== id) return;
      const scroll = () =>
        self.scrollIntoView({ behavior: "smooth", block: "start" });
      requestAnimationFrame(scroll);
      window.setTimeout(scroll, 380);
      window.setTimeout(scroll, 720);
    }
    handle();
    window.addEventListener("hashchange", handle);
    window.addEventListener(SECTION_JUMP_EVENT, handle);
    return () => {
      window.removeEventListener("hashchange", handle);
      window.removeEventListener(SECTION_JUMP_EVENT, handle);
    };
  }, [id]);

  return (
    <Tag ref={ref} id={id} className="group/sec scroll-mt-24">
      {children}
      <AnchorLink id={id} className="ml-1 inline-flex align-middle" />
    </Tag>
  );
}
