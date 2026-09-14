import type { ReactNode } from "react";

import DocumentSheetLayout from "~/components/modal-sheet/DocumentSheetLayout";
import { documentSheetHeaders } from "~/components/modal-sheet/documentSheetHeaders";

export default function SheetLayout({ children }: { children: ReactNode }) {
  return (
    <DocumentSheetLayout headers={documentSheetHeaders}>
      {children}
    </DocumentSheetLayout>
  );
}
