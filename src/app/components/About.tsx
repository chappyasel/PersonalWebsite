import { HandWavingIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import image from "public/images/about/profile.jpg";
import React from "react";

import { ThemeToggle } from "~/components/ui/theme-toggle";

import ContactButtons from "./ContactButtons";

export default async function AboutMe() {
  return (
    <div className="relative mt-6 w-full gap-2 rounded-2xl border border-foreground/[0.06] bg-muted/40 p-8 leading-5 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000 md:mt-28">
      <div className="absolute right-4 top-4 opacity-70">
        <ThemeToggle />
      </div>
      <Image
        src={image}
        alt="Profile picture"
        width={400}
        height={400}
        className="float-none m-auto mb-8 block w-[min(80%,400px)] rounded-full shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] motion-scale-in-90 md:float-left md:m-8 md:ml-0 md:mt-0 md:w-[35vw] md:max-w-[300px]"
      />
      <div className="flex flex-row gap-1">
        <p className="font-semibold">Hi, I&apos;m Chappy!</p>
        <HandWavingIcon
          size={20}
          weight="duotone"
          className="motion-scale-in-50 motion-rotate-in-45 motion-opacity-in-0 motion-delay-200 motion-ease-spring-bounciest"
        />
      </div>
      <p className="min-h-[300px] hyphens-auto text-justify [&>a:hover]:underline">
        <br />
        I taught myself to code at 12 and got completely hooked. I spent much of
        my teens cranking out iOS apps, and with a lot of obsession and some
        incredible luck, one I built in high school became the #1 homework
        planner in the world and got acquired while I was still in college.
        <br />
        <br />
        That drive to build at a bigger scale led me to my dream job at{" "}
        <Link href="https://www.apple.com" target="_blank">
          Apple
        </Link>
        , where I worked on the top-secret teams that launched the Vision Pro
        and the early prototypes of Apple Intelligence &ndash; presenting
        multimodal AI agent demos to execs right below Tim Cook.
        <br />
        <br />
        But here&apos;s what changed everything. My senior year of college, I
        wrote my final paper on the technological singularity &ndash; right when
        GPT-3 had just dropped. That research rewired my brain. It helped me
        realize four things: that AGI is probably the most significant
        advancement in the history of the universe. That my technical skills
        weren&apos;t durable &ndash; AI would be better at coding than me within
        the decade, and what actually matters is EQ and relationships. That
        society isn&apos;t remotely ready, and we as technologists have a
        responsibility to be stewards of that transition. And that AI itself is
        both the threat and the tool we need to solve it. All of that pointed me
        in one direction: community.
        <br />
        <br />
        When ChatGPT launched, I started building again &ndash; this time a
        weekly meetup with friends we called{" "}
        <Link href="https://aicollective.com" target="_blank">
          The AI Collective
        </Link>
        . I also left Apple to co-found Cofactory with a couple of brilliant
        Stanford PhDs, a venture-backed AI startup (we were Mercor and
        Cognition&apos;s first customers &ndash; both now multibillion-dollar
        companies). But the Collective was where the real conversations were
        happening &ndash; not just about what to build, but about what all of
        this means. I chose the mission.
        <br />
        <br />
        The first nine months were brutal &ndash; texting dozens of people a
        day, flying to three cities in a week, no salary, trying to convince
        people to open chapters. It felt like building a house of cards. Then we
        hit an inflection point with our global launch, and suddenly the
        flywheel had its own momentum.
        <br />
        <br />
        Today,{" "}
        <Link href="https://aicollective.com" target="_blank">
          The AI Collective
        </Link>{" "}
        is 250,000+ members strong with 600+ volunteers running 200+ chapters
        across 50+ countries &ndash; a non-profit building the social
        infrastructure for AGI. After leading it for over three years, I&apos;ve
        since shifted my focus to what&apos;s next: tools for relationship
        intelligence in a world where trust, taste, judgment, and the ability to
        mobilize the right people matter more than ever.
        <br />
        <br />
        Outside of this, I&apos;m a competitive natural bodybuilder (INBF/WNBF)
        &mdash; the discipline keeps me grounded and it&apos;s become a whole
        second identity at this point. I also read 50-100 books a year (
        <Link href="https://books.chappyasel.com" target="_blank">
          books.chappyasel.com
        </Link>
        ).
        <br />
        <br />
        The future will be shaped by people building with taste, trust, and
        agency at the center. Onwards and Upwards!
      </p>
      <div className="flex flex-col items-center gap-1 pt-8 text-muted-foreground/80">
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
    </div>
  );
}
