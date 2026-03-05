const PAGE_SIZE = 1000;

/**
 * Fetches all rows from a Supabase query by paginating in chunks of 1000.
 * Supabase limits each request to 1000 rows — this paginates automatically.
 */
export async function fetchAll<T>(
  queryFn: (range: { from: number; to: number }) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await queryFn({ from: offset, to: offset + PAGE_SIZE - 1 });
    if (error) throw new Error(error.message);
    const rows = data || [];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}
