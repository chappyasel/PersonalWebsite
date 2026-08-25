export const FIELD_NOTES_QUERY_PARAMETER = "fieldNotes";
export const FIELD_NOTES_OPEN_VALUE = "open";

export function fieldNotesOpenFromSearch(search: string) {
  return (
    new URLSearchParams(search).get(FIELD_NOTES_QUERY_PARAMETER) ===
    FIELD_NOTES_OPEN_VALUE
  );
}

export function fieldNotesUrl(href: string, open: boolean) {
  const url = new URL(href);
  if (open) {
    url.searchParams.set(FIELD_NOTES_QUERY_PARAMETER, FIELD_NOTES_OPEN_VALUE);
  } else {
    url.searchParams.delete(FIELD_NOTES_QUERY_PARAMETER);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
