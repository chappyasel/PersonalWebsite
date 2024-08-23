import React from "react";

import Link from "next/link";
import Image from "next/image";

type Contact = {
  name: string;
  link: string;
  image: string;
};

const CONTACTS: Contact[] = [
  {
      name: "LinkedIn",
      link: "https://www.linkedin.com/in/chappyasel/",
      image: "linkedin.png",
    },
    {
      name: "Github",
      link: "https://github.com/chappyasel",
      image: "github.png",
    },
    {
      name: "Medium",
      link: "https://medium.com/@chappyasel",
      image: "medium.png",
    },
    {
      name: "Twitter",
      link: "https://twitter.com/chappyasel",
      image: "twitter.png",
    },
    {
      name: "Email",
      link: "mailto:chappyasel@gmail.com",
      image: "email.png",
    },
    {
      name: "Facebook",
      link: "https://www.facebook.com/chappy.asel",
      image: "facebook.png",
    },
    {
      name: "Instagram",
      link: "https://www.instagram.com/chappyasel/",
      image: "instagram.png",
    },
  ]

export default async function ContactInfo() {
  return (
    <section className="flex w-full flex-wrap items-center justify-center">
      {CONTACTS.map((contact, _) => (
        <ContactItem key={contact.name} contact={contact} />
      ))}
    </section>
  );
}

function ContactItem({ contact }: { contact: Contact }) {
  return (
    <Link href={contact.link} target="_blank" title={contact.name}>
      <Image
        className="m-4 h-[min(20vw,100px)] w-[min(20vw,100px)] rounded-full bg-cell/20 backdrop-blur-lg shadow-[0px_5px_15px_2px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-[0px_5px_20px_0px_rgba(0,0,0,0.14)]"
        src={`/images/contact/${contact.image}`}
        alt={contact.name}
        width={100}
        height={100}
      />
    </Link>
  );
}