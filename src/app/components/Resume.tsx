import React from "react";

export default async function ResumeView() {
  return (
    <section className="flex flex-col items-center gap-4">
      <a
        className="m-auto w-[max(min(40vw,400px),300px)] cursor-pointer rounded-[20px] bg-cell font-bold shadow-[0px_5px_15px_2px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)]"
        href="/documents/Gabriel 'Chappy' Asel CV.pdf"
      >
        <h3 className="p-[15px] text-center text-xl text-body">View Resume</h3>
      </a>
      <a
        className="m-auto w-[max(min(40vw,400px),300px)] cursor-pointer rounded-[20px] bg-cell shadow-[0px_5px_15px_2px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)]"
        href="/documents/Gabriel 'Chappy' Asel CV.pdf"
      >
        <h3 className="p-[15px] text-center text-xl font-bold text-body">
          View Curriculum Vitae
        </h3>
      </a>
    </section>
  );
}
