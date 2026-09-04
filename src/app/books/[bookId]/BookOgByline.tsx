export function BookOgByline({
  author,
  publicationYear,
  color,
  separatorColor,
}: {
  author: string;
  publicationYear: number | null;
  color: string;
  separatorColor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        maxWidth: "100%",
        fontSize: "40px",
        fontWeight: 400,
        color,
        margin: "6px 0 0",
        lineHeight: 1.2,
      }}
    >
      <div
        style={{
          display: "block",
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {author}
      </div>
      {publicationYear && (
        <div style={{ display: "flex", flexShrink: 0, marginLeft: "14px" }}>
          <span
            style={{ color: separatorColor, marginRight: "14px" }}
            aria-hidden="true"
          >
            •
          </span>
          <span>{publicationYear}</span>
        </div>
      )}
    </div>
  );
}
