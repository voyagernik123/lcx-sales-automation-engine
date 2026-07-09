import type pg from 'pg';

export interface JobOutcome {
  stats: Record<string, unknown>;
  cursor?: Record<string, unknown> | null;
}

/**
 * Wrap a batch job: advisory lock (one concurrent run per job name), a
 * job_runs row for observability, and cursor persistence for incremental jobs.
 */
export async function withJobRun(
  pool: pg.Pool,
  jobName: string,
  fn: (cursor: Record<string, unknown> | null) => Promise<JobOutcome>,
): Promise<JobOutcome> {
  const client = await pool.connect();
  try {
    const { rows: lockRows } = await client.query(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      [`job:${jobName}`],
    );
    if (lockRows[0]?.locked !== true) {
      throw new Error(`Job '${jobName}' is already running (advisory lock held)`);
    }

    const { rows: prev } = await client.query(
      `SELECT cursor FROM job_runs WHERE job_name = $1 AND status = 'ok'
       ORDER BY started_at DESC LIMIT 1`,
      [jobName],
    );
    const cursor = (prev[0]?.cursor as Record<string, unknown> | null) ?? null;

    const { rows: runRows } = await client.query(
      `INSERT INTO job_runs (job_name) VALUES ($1) RETURNING id`,
      [jobName],
    );
    const runId = runRows[0].id as string;

    try {
      const outcome = await fn(cursor);
      await client.query(
        `UPDATE job_runs SET status = 'ok', finished_at = NOW(), stats = $2, cursor = $3 WHERE id = $1`,
        [runId, JSON.stringify(outcome.stats), outcome.cursor ? JSON.stringify(outcome.cursor) : null],
      );
      return outcome;
    } catch (err) {
      await client.query(
        `UPDATE job_runs SET status = 'failed', finished_at = NOW(), error = $2 WHERE id = $1`,
        [runId, err instanceof Error ? err.message : String(err)],
      );
      throw err;
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`job:${jobName}`]);
    }
  } finally {
    client.release();
  }
}
