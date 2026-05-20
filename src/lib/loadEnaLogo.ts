// Lazily fetches the Ena Coach logo from /public and converts it to a data URL
// so it can be embedded in client-side PDFs. The result is cached per page load.
//
// Returns null in non-browser contexts (SSR) or if the fetch fails — callers
// should be ready to render the PDF header without a logo.

const LOGO_URL = "/enalogo.png";
// Intrinsic dimensions of /public/enalogo.png; kept here so PDF code can preserve
// the aspect ratio without re-decoding the image.
export const ENA_LOGO_INTRINSIC = { width: 512, height: 209 } as const;

let cachedLogoPromise: Promise<string | null> | null = null;

async function fetchLogoAsDataUrl(): Promise<string | null> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return null;
  try {
    const res = await fetch(LOGO_URL, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function loadEnaLogoDataUrl(): Promise<string | null> {
  if (!cachedLogoPromise) {
    cachedLogoPromise = fetchLogoAsDataUrl();
  }
  return cachedLogoPromise;
}
