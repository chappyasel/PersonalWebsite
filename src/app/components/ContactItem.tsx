"use client";

import { type Contact } from "../util/data";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export default function ContactItem({ contact }: { contact: Contact }) {
  return (
    <Link href={contact.link} target="_blank" title={contact.name}>
      <Image
        className="m-4 h-[min(20vw,100px)] w-[min(20vw,100px)] cursor-pointer rounded-[50px] bg-cell shadow-[0px_5px_15px_2px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)]"
        src={`/images/contact/${contact.image}`}
        alt={contact.name}
        width={100}
        height={100}
      />
    </Link>
  );
}
