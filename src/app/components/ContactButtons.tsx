import {
  Facebook,
  Github,
  Instagram,
  Linkedin,
  RssIcon,
  Twitter,
} from "lucide-react";
import Link from "next/link";
import React from "react";

type Contact = {
  name: string;
  link: string;
  icon: React.ReactNode;
};

const CONTACTS: Contact[] = [
  {
    name: "LinkedIn",
    link: "https://www.linkedin.com/in/chappyasel/",
    icon: <Linkedin />,
  },
  {
    name: "Twitter",
    link: "https://twitter.com/chappyasel",
    icon: <Twitter />,
  },
  {
    name: "Medium",
    link: "https://medium.com/@chappyasel",
    icon: <RssIcon />,
  },
  {
    name: "Instagram",
    link: "https://www.instagram.com/chappyasel/",
    icon: <Instagram />,
  },
  {
    name: "Github",
    link: "https://github.com/chappyasel",
    icon: <Github />,
  },
  {
    name: "Facebook",
    link: "https://www.facebook.com/chappy.asel",
    icon: <Facebook />,
  },
];

export default async function ContactButtons() {
  return (
    <section className="flex w-full flex-wrap items-center justify-center gap-4">
      {CONTACTS.map((contact, _) => (
        <ContactButton key={contact.name} contact={contact} />
      ))}
    </section>
  );
}

function ContactButton({ contact }: { contact: Contact }) {
  return (
    <Link
      className="flex h-8 w-8 items-center justify-center transition-all duration-300 ease-in-out hover:text-body"
      href={contact.link}
      target="_blank"
      title={contact.name}
    >
      {contact.icon}
    </Link>
  );
}
