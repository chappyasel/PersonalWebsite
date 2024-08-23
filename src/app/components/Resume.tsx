import Link from "next/link";
import React from "react";

export default async function ResumeLinks() {
  return (
    <section className="flex flex-col w-full items-center gap-4">
      <Link
        className="m-auto w-full rounded-2xl bg-cell/20 backdrop-blur-lg shadow-[0px_5px_15px_2px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)]"
        href="/documents/Gabriel 'Chappy' Asel CV.pdf"
        target="_blank"
      >
        <h3 className="p-4 text-center text-xl font-bold text-body">
          View Resume
        </h3>
      </Link>
      <Link
        className="m-auto w-full rounded-2xl bg-cell/20 backdrop-blur-lg shadow-[0px_5px_15px_2px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)]"
        href="/documents/Gabriel 'Chappy' Asel CV.pdf"
        target="_blank"
      >
        <h3 className="p-4 text-center text-xl font-bold text-body">
          View Curriculum Vitae
        </h3>
      </Link>
    </section>
  );
}
