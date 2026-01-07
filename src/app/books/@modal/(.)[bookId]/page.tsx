"use client";

import { use } from "react";
import { Modal } from "./Modal";

type PageProps = {
  params: Promise<{ bookId: string }>;
};

export default function BookModalPage({ params }: PageProps) {
  const { bookId } = use(params);
  return <Modal bookId={bookId} />;
}
