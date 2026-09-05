import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString });
  }
  return pool;
}

/** Best-effort query: logs and swallows errors rather than throwing, for
 * writes (search logging) that shouldn't fail the user-facing request if
 * the database is briefly unavailable. Reads should use getPool().query
 * directly so callers can handle "not found" vs "DB down" distinctly. */
export async function bestEffortQuery(text: string, params: unknown[], onError: (err: unknown) => void): Promise<void> {
  try {
    await getPool().query(text, params);
  } catch (err) {
    onError(err);
  }
}
