"use client";

import { useEffect } from "react";

import { getBooksOrigin } from "~/lib/books/origin";
import { BooksTRPCProvider } from "~/trpc/books-provider";

import { ModalHost } from "~/app/books/components/ModalHost";
import { inlineBookIdFromHistory } from "~/app/books/components/modalHistory";
import {
  BookPreviewProvider,
  useModalActions,
} from "~/app/books/contexts/BookPreviewContext";

function OpenRequestedBook({ request }: { request: { bookId: string } }) {
  const { openModalById } = useModalActions();
  useEffect(() => {
    // A visitor may go back or navigate away while the modal chunk loads.
    if (
      inlineBookIdFromHistory(
        window.location.pathname,
        window.history.state,
      ) === request.bookId
    ) {
      openModalById(request.bookId);
    }
  }, [request, openModalById]);
  return null;
}

export default function InlineBookModal({
  request,
}: {
  request: { bookId: string };
}) {
  return (
    <BooksTRPCProvider>
      <BookPreviewProvider>
        <OpenRequestedBook request={request} />
        <ModalHost
          presentation={{ source: "document", booksHref: getBooksOrigin() }}
        />
      </BookPreviewProvider>
    </BooksTRPCProvider>
  );
}
