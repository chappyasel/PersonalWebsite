import { MicrophoneStageIcon } from "@phosphor-icons/react/dist/ssr";
import data from "public/data/speaking.json";

import TalkCard, { type Talk } from "./TalkCard";

const TALKS: Talk[] = data.talks;

export default async function Talks() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground md:gap-3 md:text-3xl">
        <MicrophoneStageIcon
          weight="duotone"
          className="size-7 shrink-0 md:size-8"
        />
        Featured Talks
      </h1>

      <div className="flex w-full flex-col gap-4">
        {TALKS.map((talk) => (
          <TalkCard key={talk.videoId} talk={talk} />
        ))}
      </div>
    </section>
  );
}
