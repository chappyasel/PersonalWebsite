import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import { TRPCReactProvider } from "~/trpc/react";

// Exercise sheets can open over the room or the weightlifting dashboard.
// Keep one interceptor at the root so both launchers use the same sheet.
export default function ExerciseSheetProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TRPCReactProvider>
      <NuqsAdapter>{children}</NuqsAdapter>
    </TRPCReactProvider>
  );
}
