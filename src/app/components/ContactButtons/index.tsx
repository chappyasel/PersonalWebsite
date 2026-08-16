import {
  GithubLogoIcon,
  InstagramLogoIcon,
  LinkedinLogoIcon,
  RssSimpleIcon,
  XLogoIcon,
} from "@phosphor-icons/react/dist/ssr";

import { type Contact, ContactButton } from "./ContactButton";

const CONTACTS: Contact[] = [
  {
    title: "LinkedIn",
    username: "/in/chappyasel",
    link: "https://www.linkedin.com/in/chappyasel/",
    icon: <LinkedinLogoIcon size={28} weight="duotone" />,
  },
  {
    title: "X / Twitter",
    username: "@chappyasel",
    link: "https://twitter.com/chappyasel",
    icon: <XLogoIcon size={28} weight="duotone" />,
  },
  {
    title: "Instagram",
    username: "@chappyasel",
    link: "https://www.instagram.com/chappyasel/",
    icon: <InstagramLogoIcon size={28} weight="duotone" />,
  },
  {
    title: "Github",
    username: "chappyasel",
    link: "https://github.com/chappyasel",
    icon: <GithubLogoIcon size={28} weight="duotone" />,
  },
  {
    title: "Medium",
    username: "@chappyasel",
    link: "https://medium.com/@chappyasel",
    icon: <RssSimpleIcon size={28} weight="duotone" />,
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
