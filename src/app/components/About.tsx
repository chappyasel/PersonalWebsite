import { DATA } from "../util/data";
import Image from "next/image";
import image from "public/images/about/profile.jpg";
import React from "react";

export default async function About() {
  return (
    <div className="md:w-9/10 w-4/5 max-w-5xl">
      <Image
        src={image}
        alt="Profile picture"
        width={400}
        height={400}
        className="float-none m-auto mb-8 block w-[min(80%,400px)] rounded-full shadow-[0px_5px_20px_2px_rgba(0,0,0,0.2)] md:float-left md:m-8 md:ml-0 md:mt-0 md:w-[35vw] md:max-w-[300px]"
      />
      <p
        className="min-h-[300px] hyphens-auto text-justify text-lg [&>a:hover]:underline"
        dangerouslySetInnerHTML={DATA.aboutMe}
      />
    </div>
  );
}
