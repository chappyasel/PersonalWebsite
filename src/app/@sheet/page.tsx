// Parallel slots retain their last content when a soft navigation has no
// matching route. The catch-all requires at least one segment, so returning
// to `/` needs this explicit empty page to dismiss an intercepted document.
export default function EmptyHomeSheet() {
  return null;
}
