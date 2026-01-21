import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { neon, neonConfig } from '@neondatabase/serverless';
import { config } from '../config';

// Type for Neon SQL function
type NeonSqlFunction = ReturnType<typeof neon>;

// Determine if we're in a serverless environment (Azure Functions)
const isServerless = !!process.env.FUNCTIONS_WORKER_RUNTIME;

// Configure Neon for serverless if needed
if (isServerless) {
  // Enable connection caching for serverless
  neonConfig.fetchConnectionCache = true;
}

/**
 * Serverless-optimized connection pool
 *
 * In serverless environments:
 * - Reduced pool size (3 max connections vs 20)
 * - Shorter idle timeout (10s vs 30s)
 * - Uses Neon's serverless driver for better cold start performance
 */
const pool = new Pool({
  connectionString: config.databaseUrl,
  // Smaller pool for serverless - each function instance gets its own pool
  max: isServerless ? 3 : 20,
  // Shorter idle timeout for serverless to free connections faster
  idleTimeoutMillis: isServerless ? 10000 : 30000,
  // Faster connection timeout for better cold start handling
  connectionTimeoutMillis: isServerless ? 5000 : 2000,
  // Require SSL for Neon connections
  ssl: config.databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
});

// Neon serverless SQL function for simple queries (better cold start performance)
let neonSql: NeonSqlFunction | null = null;
if (isServerless && config.databaseUrl.includes('neon.tech')) {
  neonSql = neon(config.databaseUrl);
}

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Log pool connection events in development
if (config.isDevelopment) {
  pool.on('connect', () => {
    console.log('[DB] New client connected to pool');
  });
  pool.on('remove', () => {
    console.log('[DB] Client removed from pool');
  });
}

/**
 * Query helper with optional Neon serverless optimization
 *
 * For simple queries in serverless, uses Neon's HTTP-based driver
 * which has better cold start performance than connection pooling.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();

  // Use pool for all queries (Neon serverless is experimental)
  const result = await pool.query<T>(text, params);

  const duration = Date.now() - start;

  if (config.isDevelopment) {
    console.log('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
  }

  return result;
}

/**
 * Neon serverless query - uses HTTP instead of WebSocket for lower latency on cold starts
 * Best for simple SELECT queries that don't need transactions
 */
export async function neonQuery<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  if (!neonSql) {
    // Fallback to pool if Neon serverless not available
    const result = await pool.query<T extends QueryResultRow ? T : never>(sql, params);
    return result.rows as T[];
  }

  const start = Date.now();
  const result = await neonSql(sql, params) as T[];
  const duration = Date.now() - start;

  if (config.isDevelopment) {
    console.log('Executed neon query', { sql: sql.substring(0, 100), duration, rows: result.length });
  }

  return result;
}

// Get client for transactions
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// Transaction helper
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Health check
export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
}

// Export pool for advanced usage
export { pool, isServerless };
