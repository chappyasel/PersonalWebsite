import { BookOpenTextIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import image from "public/images/about/profile.jpg";
import React from "react";

import ContactButtons from "./ContactButtons";

export default async function AboutMe() {
  return (
    <div className="mt-28 w-full gap-2 rounded-3xl bg-cell/20 p-8 leading-5 shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] backdrop-blur-lg intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
      <Image
        src={image}
        alt="Profile picture"
        width={400}
        height={400}
        className="float-none m-auto mb-8 block w-[min(80%,400px)] rounded-full shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)] motion-scale-in-90 md:float-left md:m-8 md:ml-0 md:mt-0 md:w-[35vw] md:max-w-[300px]"
      />
      <div className="flex flex-row gap-1">
        <p className="font-bold">Hi, I&apos;m Chappy!</p>
        <p className="font-bold motion-scale-in-50 motion-rotate-in-45 motion-opacity-in-0 motion-delay-200 motion-ease-spring-bounciest">
          👋
        </p>
      </div>
      <p className="min-h-[300px] hyphens-auto text-justify [&>a:hover]:underline">
        <br />
        I&apos;ve always been a builder at heart. My journey started at age 12
        when I fell in love with coding. I spent my teen years building dozens
        of apps, and with a mix of a builder&apos;s obsession and some
        incredible luck, an app I made in high school became the #1 homework app
        in the world before being acquired while I was in college.
        <br />
        <br />
        That drive to build on a bigger scale led me straight to my dream job at{" "}
        <Link href="https://www.apple.com" target="_blank">
          Apple
        </Link>
        , working on the top-secret teams that launched the Vision Pro and the
        early prototypes of what would become Apple Intelligence. It was
        exhilarating; it felt like I was at the center of the universe.
        <br />
        <br />
        But at the same time, my builder&apos;s mindset was colliding with a
        philosopher&apos;s questions. My research into the technological
        singularity during college left me obsessed with a critical problem: the
        ever-widening gap between the speed of technology and society&apos;s
        ability to adapt.
        <br />
        <br />
        When ChatGPT launched, it felt like the timeline was collapsing. This
        forced a choice: continue the traditional venture-backed startup dream
        or go all-in on the mission that truly consumed me. I chose the mission.
        I started with a few texts to friends, which turned into a small weekly
        meetup we called{" "}
        <Link href="https://aicollective.com" target="_blank">
          The AI Collective
        </Link>
        .
        <br />
        <br />
        And wow, has it been a rocket ship ever since! That small gathering has
        blossomed into a global, non-profit, grassroots movement of pioneers on
        the frontier of AI. We&apos;re building the social infrastructure for
        humanity&apos;s most important conversation, because we believe the
        future is too important to be built in isolation.
        <br />
        <br />
        When I&apos;m not obsessing over this mission, you can usually find me
        in one of three places: in the gym, practicing the intense discipline of{" "}
        <Link href="https://www.instagram.com/boyswithgains/" target="_blank">
          competitive natural bodybuilding
        </Link>{" "}
        (it&apos;s my secret to staying grounded); with my head{" "}
        <em>(metaphorically)</em> in an{" "}
        <Link href="https://books.chappyasel.com" target="_blank">
          audiobook
        </Link>{" "}
        (I&apos;m a bibliomaniac who reads 50-100 a year); or on a plane to a
        new corner of the world (I&apos;ve explored over 25 countries so far)!
        <br />
        <br />
        Ultimately, I&apos;m an optimist who believes we have a rare opportunity
        to shape a future of trust, openness, and human flourishing. Thanks for
        stopping by to learn a little more about my journey! 😄
      </p>
      <div className="flex flex-col items-center gap-1 pt-8 text-body/80">
        <Link
          href="https://chappyasel.notion.site/manual"
          target="_blank"
          className="-mt-4 mb-4 flex items-center gap-2 rounded-xl border-2 border-transparent px-4 py-2 text-sm font-medium transition-all duration-300 ease-in-out hover:scale-105 hover:border-body/20 hover:text-body hover:shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)]"
        >
          <BookOpenTextIcon size={20} weight="duotone" />
          <span>Personal Operating Manual</span>
        </Link>
        <ContactButtons />
        {/* <p className="flex flex-row gap-2">
          <Link
            href="mailto:chappyasel@gmail.com"
            className="line-clamp-1 transition-all duration-300 ease-in-out hover:text-body hover:underline"
          >
            chappyasel [at] gmail.com
          </Link>
          {" • "}
          <Link
            href="mailto:chappy@aicollective.com"
            className="line-clamp-1 transition-all duration-300 ease-in-out hover:text-body hover:underline"
          >
            chappy [at] aicollective.com
          </Link>
        </p> */}
        {/* <div className="flex flex-row gap-2">
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
        </div> */}
      </div>
    </div>
  );
}
