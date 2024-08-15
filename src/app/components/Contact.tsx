import { DATA } from "../util/data";
import React from "react";

import ContactItem from "./ContactItem";

export default async function ContactView() {
  return (
    <section className="flex max-w-[500px] flex-wrap items-center justify-center p-0 px-10">
      {DATA.contacts.map((contact, _) => (
        <ContactItem key={contact.name} contact={contact} />
      ))}
    </section>
  );
}
