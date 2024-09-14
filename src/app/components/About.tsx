import Image from "next/image";
import Link from "next/link";
import image from "public/images/about/profile.jpg";
import React from "react";

import ContactButtons from "./ContactButtons";

export default async function AboutMe() {
  return (
    <div className="w-full rounded-3xl bg-cell/20 p-8 shadow-[0px_5px_20px_2px_rgba(0,0,0,0.2)] backdrop-blur-lg">
      <Image
        src={image}
        alt="Profile picture"
        width={400}
        height={400}
        className="float-none m-auto mb-8 block w-[min(80%,400px)] rounded-full shadow-[0px_5px_20px_2px_rgba(0,0,0,0.2)] md:float-left md:m-8 md:ml-0 md:mt-0 md:w-[35vw] md:max-w-[300px]"
      />
      <p className="min-h-[300px] hyphens-auto text-justify text-lg [&>a:hover]:underline">
        Hi, I&apos;m Chappy Asel 👋
        <br />
        <br />
        I&apos;m a serial entrepreneur with an expansive technical and
        operational background built across 10+ years of experience. I&apos;m
        one of the co-founders of the GenAI Collective: a community of founders,
        funders, and thought leaders built around our shared curiosity for AI.
        I&apos;ve also worked at Apple on AR/VR, AI/ML, and Meta. I&apos;ve
        founded and developed multiple top-rated mobile applications.
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
      <ContactButtons />
    </div>
  );
}
