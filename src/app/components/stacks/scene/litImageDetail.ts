export type LitImageDetail<Resource> = Readonly<{
  url: string;
  resource: Resource;
  isReleased: () => boolean;
}>;

/** Select only a detail whose lease is still live at this exact render. */
export function liveLitImageDetailResource<Resource>({
  detail,
  enabled,
  url,
}: {
  detail: LitImageDetail<Resource> | null;
  enabled: boolean;
  url?: string;
}): Resource | null {
  return enabled && url && detail?.url === url && !detail.isReleased()
    ? detail.resource
    : null;
}

/** Drop only the record owned by the lease being released. A newer lease may
 * share both its URL and cached resource and must survive an older cleanup. */
export function clearReleasedLitImageDetail<Resource>(
  current: LitImageDetail<Resource> | null,
  released: LitImageDetail<Resource>,
): LitImageDetail<Resource> | null {
  return current === released ? null : current;
}
