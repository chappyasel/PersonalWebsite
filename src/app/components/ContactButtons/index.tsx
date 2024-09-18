import {
  Facebook,
  Github,
  Instagram,
  Linkedin,
  RssIcon,
  Twitter,
} from "lucide-react";
import React from "react";

import { type Contact, ContactButton } from "./ContactButton";

const CONTACTS: Contact[] = [
  {
    title: "LinkedIn",
    username: "/in/chappyasel",
    link: "https://www.linkedin.com/in/chappyasel/",
    icon: <Linkedin />,
  },
  {
    title: "Twitter",
    username: "@chappyasel",
    link: "https://twitter.com/chappyasel",
    icon: <Twitter />,
  },
  {
    title: "Medium",
    username: "@chappyasel",
    link: "https://medium.com/@chappyasel",
    icon: <RssIcon />,
  },
  {
    title: "Instagram",
    username: "@chappyasel",
    link: "https://www.instagram.com/chappyasel/",
    icon: <Instagram />,
  },
  {
    title: "Github",
    username: "chappyasel",
    link: "https://github.com/chappyasel",
    icon: <Github />,
  },
  {
    title: "Facebook",
    username: "chappy.asel",
    link: "https://www.facebook.com/chappy.asel",
    icon: <Facebook />,
  },
];

export default async function ContactButtons() {
  return (
    <section className="flex w-full flex-wrap items-center justify-center gap-4">
      {CONTACTS.map((contact) => (
        <ContactButton key={contact.title} contact={contact} />
      ))}
    </section>
  );
}
