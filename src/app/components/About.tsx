import { HandWavingIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import image from "public/images/about/profile.jpg";
import React from "react";

import { IntersectionMotion } from "~/components/ui/intersection-motion";
import { ThemeToggle } from "~/components/ui/theme-toggle";

import ContactButtons from "./ContactButtons";
import { StacksSectionLink } from "./stacks/dom/StacksSectionLink";

function Greeting() {
  return (
    <div className="flex flex-row gap-1">
      <p className="font-semibold">Hi, I&apos;m Chappy!</p>
      <HandWavingIcon
        size={20}
        weight="duotone"
        className="motion-scale-in-50 motion-rotate-in-45 motion-opacity-in-0 motion-delay-200 motion-ease-spring-bounciest"
      />
    </div>
  );
}

function Bio({ className }: { className: string }) {
  return (
    <p className={className}>
      <br />I taught myself to code at 12, got completely hooked, and spent much
      of my teens cranking out iOS apps.{" "}
      <span data-nosnippet="">
        With a lot of tinkering and some incredible luck, one I built in high
        school became the #1 homework planner in the world and was acquired
        during college.
      </span>
      <br />
      <br />
      That early success led me to my dream job at{" "}
      <Link
        href="https://www.apple.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        Apple
      </Link>{" "}
      and put me at the frontier of what technology could do, first in AI/ML
      R&amp;D and then on the teams building Vision Pro and the earliest
      prototypes of what became Apple Intelligence. The work was exhilarating.
      For a while, it felt like the center of the universe.
      <br />
      <br />
      At the same time, a question from my senior year of college was becoming
      an obsession. My final paper on GPTs and the technological singularity
      convinced me that the widening gap between the pace of technology and
      society&apos;s capacity to adapt would be the defining challenge of my
      lifetime. If ASI could be humanity&apos;s final invention, I wanted to
      dedicate my career to helping us build it wisely and turn its power into
      broadly shared human flourishing.
      <br />
      <br />
      When ChatGPT launched, it felt like the timeline had collapsed overnight.
      I started inviting friends into my living room each week, and that
      gathering eventually became{" "}
      <Link
        href="https://aicollective.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        The AI Collective
      </Link>
      . Through the community, I met two brilliant Stanford PhDs and left Apple
      to co-found Cofactory, a venture-backed AI agent startup. For a while, I
      was building both the company and the community. As AIC grew, it became
      increasingly clear that this was where I could make the most distinctive
      contribution, so I eventually chose to focus on it full-time.
      <br />
      <br />
      Over the next three years, we grew AIC into a global nonprofit with over a
      quarter-million members and hundreds of chapters around the world. Today I
      serve as chairman and AIC remains central to my life. An exceptional
      leadership team now runs the organization day to day, bringing more people
      into the mission and allowing us to accomplish far more together.
      <br />
      <br />
      I am now returning to the kind of work that has always energized me most:
      starting from zero, learning at full speed, and working with exceptional
      people on a problem that matters. I am searching for the idea and team I
      want to commit the next decade to, with the ambition to build something at
      the frontier of AI that can reach enormous scale.
      <br />
      <br />
      Alongside my own building, I serve on the board of the{" "}
      <Link
        href="https://tjpartnershipfund.org/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Thomas Jefferson Partnership Fund
      </Link>{" "}
      and selectively invest in and advise early-stage founders.
      <br />
      <br />
      The rest of my life is similarly nerdy. I&apos;m an incurable{" "}
      <Link
        href="https://books.chappyasel.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        bookworm
      </Link>{" "}
      and lifelong autodidact, compete in{" "}
      <Link
        href="https://weightlifting.chappyasel.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        natural bodybuilding
      </Link>{" "}
      (
      <Link
        href="https://worldnaturalbb.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        INBF/WNBF
      </Link>
      ), and spend an unreasonable amount of time designing{" "}
      <StacksSectionLink unit="systems">personal systems</StacksSectionLink> for
      how I learn, work, and live. I occasionally{" "}
      <StacksSectionLink unit="blog">write</StacksSectionLink> and{" "}
      <StacksSectionLink unit="talks">speak</StacksSectionLink> about what I am
      learning along the way.
      <br />
      <br />
      If you are working on an important problem, want to build something
      unusually ambitious, or simply think we would have a fascinating
      conversation, I would love to hear from you.
    </p>
  );
}

/** Greeting + bio without the card shell or photo — placard content for the
 * Stacks About unit (the photo lives in-scene as a framed portrait). */
export function AboutIntro() {
  return (
    <>
      <Greeting />
      <Bio className="hyphens-auto [&>a:hover]:underline" />
    </>
  );
}

export default async function AboutMe() {
  return (
    <IntersectionMotion
      data-placard-surface=""
      className="relative mt-6 w-full gap-2 rounded-2xl border border-foreground/[0.06] bg-muted/40 p-8 leading-5 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000 md:mt-28"
    >
      <div className="absolute right-4 top-4 opacity-70">
        <ThemeToggle />
      </div>
      <Link
        href="https://www.linkedin.com/in/chappyasel/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open Chappy's LinkedIn"
      >
        <Image
          src={image}
          alt="Profile picture"
          width={400}
          height={400}
          preload
          className="float-none m-auto mb-8 block w-[min(80%,400px)] rounded-full shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] motion-scale-in-90 md:float-left md:m-8 md:ml-0 md:mt-0 md:w-[35vw] md:max-w-[300px]"
        />
      </Link>
      <Greeting />
      <Bio className="min-h-[300px] hyphens-auto text-justify [&>a:hover]:underline" />
      <div className="flex flex-col items-center gap-1 pt-8 text-muted-foreground">
        <ContactButtons />
        {/* <p className="flex flex-row gap-2">
          <Link
            href="mailto:chappyasel@gmail.com"
            className="line-clamp-1 transition-all duration-300 ease-in-out hover:text-muted-foreground hover:underline"
          >
            chappyasel [at] gmail.com
          </Link>
          {" • "}
          <Link
            href="mailto:chappy@aicollective.com"
            className="line-clamp-1 transition-all duration-300 ease-in-out hover:text-muted-foreground hover:underline"
          >
            chappy [at] aicollective.com
          </Link>
        </p> */}
        {/* <div className="flex flex-row gap-2">
          <Link
            href="/documents/Gabriel 'Chappy' Asel CV.pdf"
            target="_blank"
            className="transition-all duration-300 ease-in-out hover:text-muted-foreground hover:underline"
          >
            resume
          </Link>
          {" • "}
          <Link
            href="/documents/Gabriel 'Chappy' Asel CV.pdf"
            target="_blank"
            className="transition-all duration-300 ease-in-out hover:text-muted-foreground hover:underline"
          >
            curriculum vitae
          </Link>
        </div> */}
      </div>
    </IntersectionMotion>
  );
}
