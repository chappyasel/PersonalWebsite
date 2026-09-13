"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import React, { useState } from "react";

import { type ContactMethod, capture } from "~/lib/analytics";
import { cn } from "~/lib/util";

export type Contact = {
  title: string;
  username: string;
  link: string;
  icon: React.ReactNode;
  analyticsId: ContactMethod;
};

export function ContactButton({ contact }: { contact: Contact }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link
      className="relative flex h-8 w-8 items-center justify-center transition-all duration-300 ease-in-out hover:text-muted-foreground"
      href={contact.link}
      target={contact.link.startsWith("/") ? undefined : "_blank"}
      aria-label={contact.title}
      onClick={() =>
        capture("homepage_contact_selected", { method: contact.analyticsId })
      }
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn("flex flex-shrink-0", isHovered ? "z-20" : "")}>
        {contact.icon}
      </div>
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="pointer-events-none absolute -left-12 z-10 flex flex-row items-center gap-2 overflow-clip truncate rounded-lg bg-muted px-3 py-1 shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)]"
            initial={{ opacity: 0, scale: 0.4, x: 43, width: 0 }}
            animate={{ opacity: 1, scale: 1, x: 43, width: "auto" }}
            exit={{ opacity: 0, scale: 0.4, x: 43, width: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <div className="flex flex-shrink-0 opacity-0">{contact.icon}</div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{contact.title}</span>
              <span className="-mt-1 text-xs">{contact.username}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Link>
  );
}
