"use client";

import { Modal } from "./Modal";

type PageProps = {
  params: { bookId: string };
};

export default function BookModalPage({ params }: PageProps) {
  return <Modal bookId={params.bookId} />;
}
