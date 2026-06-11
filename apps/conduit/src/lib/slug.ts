/** Create a URL-safe slug from a title string */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  )
}

/**
 * Generate a unique slug by appending a random suffix if the base slug
 * already exists in the database.
 */
export async function uniqueSlug(title: string, checkExists: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugify(title)
  if (!(await checkExists(base))) return base

  // Try numeric suffixes first
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`
    if (!(await checkExists(candidate))) return candidate
  }

  // Fall back to random hex suffix
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 8)
    const candidate = `${base}-${suffix}`
    if (!(await checkExists(candidate))) return candidate
  }

  // Last resort: timestamp-based
  return `${base}-${Date.now()}`
}
