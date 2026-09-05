import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://bot:bot@localhost:5432/bot"
  });

  async query<T extends QueryResultRow = any>(text: string, params: any[] = []) {
    return this.pool.query<T>(text, params);
  }

  async one<T extends QueryResultRow = any>(text: string, params: any[] = []) {
    const result = await this.pool.query<T>(text, params);
    return result.rows[0] ?? null;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
