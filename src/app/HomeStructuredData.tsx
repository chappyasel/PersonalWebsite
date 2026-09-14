import { homepageStructuredData } from "./homeMetadata";

export default function HomeStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(homepageStructuredData).replace(/</g, "\\u003c"),
      }}
    />
  );
}
