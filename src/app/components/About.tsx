import Image from "next/image";
import Link from "next/link";
import image from "public/images/about/profile.jpg";
import React from "react";

import ContactButtons from "./ContactButtons";

export default async function AboutMe() {
  return (
    <div className="w-full gap-2 rounded-3xl bg-cell/20 p-8 shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] backdrop-blur-lg">
      <Image
        src={image}
        alt="Profile picture"
        width={400}
        height={400}
        className="float-none m-auto mb-8 block w-[min(80%,400px)] rounded-full shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] md:float-left md:m-8 md:ml-0 md:mt-0 md:w-[35vw] md:max-w-[300px]"
      />
      <p className="min-h-[300px] hyphens-auto text-justify text-lg leading-6 [&>a:hover]:underline">
        Hi, I&apos;m Chappy Asel 👋
        <br />
        <br />
        I&apos;m a serial entrepreneur with an expansive technical and
        operational background built across 10+ years of experience. I&apos;m
        one of the co-founders of the{" "}
        <Link href="https://genaicollective.ai" target="_blank">
          GenAI Collective
        </Link>
        , a community of founders, funders, and thought leaders built around our
        shared curiosity for AI. I&apos;ve also worked at Apple on AR/VR, AI/ML,
        and Meta. I&apos;ve founded and developed multiple top-rated mobile
        applications. founded and developed multiple top-rated mobile
        applications.
        <br />
        <br />
        I&apos;m passionate about advancing technology, embracing the leading
        edge, and connecting with like-minded individuals. I&apos;m an
        exothermic leader and avid networker. I&apos;m a systems-oriented
        problem solver with a growth mindset and an insatiable appetite for
        learning. I&apos;m a bookworm and world traveler.
        <br />
        <br />
        I&apos;m a competitive natural bodybuilder competing in the INBF/WNBF.
        I&apos;m a former lead fitness instructor at F45 coaching weekly HIIT
        classes with 20+ participants.
        <br />
        <br />
        For more details on each project, feel free to click on each of their
        respective links below. If you have any further questions regarding my
        past work experience or credentials please feel free to read through my{" "}
        <Link href="https://www.linkedin.com/in/chappyasel/" target="_blank">
          LinkedIn
        </Link>{" "}
        or via the email listed at the top of my resume.
      </p>
      <div className="flex translate-y-3 flex-col items-center gap-1 text-body/80">
        <ContactButtons />
        <p className="flex flex-row gap-2">
          <Link
            href="mailto:chappyasel@gmail.com"
            className="line-clamp-1 transition-all duration-300 ease-in-out hover:text-body hover:underline"
          >
            chappyasel [at] gmail.com
          </Link>
          {" • "}
          <Link
            href="mailto:chappy@genaicollective.ai"
            className="line-clamp-1 transition-all duration-300 ease-in-out hover:text-body hover:underline"
          >
            chappy [at] genaicollective.ai
          </Link>
        </p>
        <div className="flex flex-row gap-2">
          <Link
            href="/documents/Gabriel 'Chappy' Asel CV.pdf"
            target="_blank"
            className="transition-all duration-300 ease-in-out hover:text-body hover:underline"
          >
            resume
          </Link>
          {" • "}
          <Link
            href="/documents/Gabriel 'Chappy' Asel CV.pdf"
            target="_blank"
            className="transition-all duration-300 ease-in-out hover:text-body hover:underline"
          >
            curriculum vitae
          </Link>
        </div>
        <p className="text-center text-sm italic text-body/60">
          (My website is ugly right now, I know. I&apos;ll get around to it when
          I can! 😅)
        </p>
      </div>
    </div>
  );
}
