"use client";

import dynamic from "next/dynamic";

import { useModalState } from "../contexts/BookPreviewContext";

const Modal = dynamic(
  () => import("./Modal").then((module) => module.Modal),
  { ssr: false },
);

export function ModalHost() {
  const { isModalOpen } = useModalState();
  return isModalOpen ? <Modal /> : null;
}
