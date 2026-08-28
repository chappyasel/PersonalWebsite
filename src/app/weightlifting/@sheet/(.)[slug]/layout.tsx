import { WeightliftingSheet } from "../WeightliftingSheet";

// The sheet chrome lives in the segment LAYOUT so it mounts the instant the
// navigation starts — loading.tsx streams a skeleton inside it while the
// exercise detail resolves. Navigating between variations swaps the page
// inside this same mounted sheet.
export default async function InterceptedExerciseLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  return (
    <WeightliftingSheet label="Exercise detail" expandSubpath={`/${slug}`}>
      {children}
    </WeightliftingSheet>
  );
}
