export function slugify(input: string, maxLength: number): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'item';
}

export function isValidSlug(value: string, maxLength: number): boolean {
  return value.length <= maxLength && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export async function uniqueSlug(
  base: string,
  maxLength: number,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base, maxLength);
  if (!(await exists(root))) return root;
  for (let i = 2; i < 1000; i += 1) {
    const suffix = `-${i}`;
    const candidate = `${slugify(base, maxLength - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('Could not generate a unique slug');
}
