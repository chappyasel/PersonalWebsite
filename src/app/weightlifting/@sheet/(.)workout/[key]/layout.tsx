import ModalSheet from "~/components/modal-sheet/ModalSheet";

// The workout preview intercepted over its launcher — the calendar's day
// cell or an exercise page's instance row — as a content-hugging card.
export default async function InterceptedWorkoutLayout({
  params,
  children,
}: {
  params: Promise<{ key: string }>;
  children: React.ReactNode;
}) {
  const { key } = await params;
  return (
    <ModalSheet
      label="Workout details"
      variant="card"
      expandHref={`/weightlifting/workout/${key}`}
    >
      {children}
    </ModalSheet>
  );
}
