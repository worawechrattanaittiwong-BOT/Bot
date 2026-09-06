import { Controller, Get } from "@nestjs/common";
import { DbService } from "./db.service";

@Controller("catalog")
export class CatalogController {
  constructor(private readonly db: DbService) {}

  @Get("brokers")
  async brokers() {
    const rows = await this.db.query(
      `SELECT
         b.code,
         b.name,
         COALESCE(
           json_agg(
             json_build_object(
               'serverName', s.server_name,
               'environment', s.environment
             )
             ORDER BY s.sort_order, s.server_name
           ) FILTER (WHERE s.id IS NOT NULL),
           '[]'::json
         ) AS servers
       FROM brokers b
       LEFT JOIN broker_servers s
         ON s.broker_id=b.id AND s.active=true
       WHERE b.active=true
       GROUP BY b.id,b.code,b.name,b.sort_order
       ORDER BY b.sort_order,b.name`
    );

    return rows.rows;
  }
}
