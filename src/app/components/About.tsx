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
        <span className="font-bold">Hi, I&apos;m Chappy Asel! 👋</span>
        <br />
        <br />
        I&apos;m a serial entrepreneur with an expansive technical and
        operational background built across 10+ years of experience. I&apos;m
        one of the co-founders of the{" "}
        <Link href="https://genaicollective.ai" target="_blank">
          GenAI Collective
        </Link>
        , a community of founders, funders, and thought leaders built around our
        shared curiosity for AI. Previously, I co-founded{" "}
        <Link href="https://cofactory.ai" target="_blank">
          Cofactory
        </Link>
        . I&apos;ve also worked at Apple on AR/VR, AI/ML, and Meta. I&apos;ve
        founded and developed multiple top-rated mobile applications.
        applications.
        <br />
        <br />
        I&apos;m extremely passionate about advancing technology, embracing the
        leading edge, and connecting with like-minded individuals. I consider
        myself an exothermic leader and an avid networker. I&apos;m a
        systems-oriented problem solver with a growth mindset and an insatiable
        appetite for learning!
        <br />
        <br />
        Beyond my passion for technology and entrepreneurship, I&apos;m a{" "}
        <Link href="https://www.instagram.com/boyswithgains/" target="_blank">
          competitive natural bodybuilder
        </Link>{" "}
        competing in the INBF/WNBF. I also love{" "}
        <Link href="https://books.chappyasel.com" target="_blank">
          reading
        </Link>
        , writing, and traveling the world!
        <br />
        <br />
        My personal mission statement:
      </p>
      <blockquote className="mt-2 border-l-4 border-body/20 pl-3 text-lg italic leading-6 text-body/80">
        To be a loving, trustworthy, and inspiring leader committed to creating
        an environment of passion. To put the best interests of myself and the
        ones I love above all else. To be respected and well-regarded amongst
        all who know me. To be a rational, agentic, T-shaped, systems thinker
        committed to lifelong learning and growth with relentless ambition. To
        always keep the long-term goal in mind while also enjoying the journey.
        To value the experiential over the material and high peaks over
        sustained happiness. To strive for superior physical, mental, and social
        health. To have a long-lasting positive impact on society by creating
        and empowering others to self-actualize. To make a dent in the universe.
      </blockquote>
      <div className="flex flex-col items-center gap-1 pt-6 text-body/80">
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
