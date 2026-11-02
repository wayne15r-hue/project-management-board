/** Render expected API conflicts as text; keep unexpected server internals hidden. */
export async function responseError(response: Response, fallback: string): Promise<Error> {
  if (response.status >= 500) return new Error(fallback);
  try {
    const body = await response.json();
    if (typeof body.error === "string" && body.error.trim()) return new Error(body.error);
  } catch { /* A proxy or older endpoint may return a non-JSON response. */ }
  return new Error(fallback);
}
