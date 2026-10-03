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
             ORDER BY
               CASE s.environment WHEN 'REAL' THEN 0 WHEN 'DEMO' THEN 1 ELSE 2 END,
               s.sort_order,
               lower(s.server_name),
               s.server_name
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

    // Keep the dropdown useful even when a verified broker server has not yet
    // been persisted into broker_servers. Only authenticated account bindings
    // already present in SCENOVA are used as additional suggestions.
    const observed = await this.db.query(
      `SELECT DISTINCT
         trim(broker) AS broker,
         trim(broker_server) AS server_name
       FROM mt5_accounts
       WHERE status='ACTIVE'
         AND COALESCE(trim(broker),'')<>''
         AND COALESCE(trim(broker_server),'')<>''`
    );

    const environmentRank:Record<string,number> = { REAL:0, DEMO:1, UNKNOWN:2 };

    return rows.rows.map((row:any) => {
      const servers = Array.isArray(row.servers) ? [...row.servers] : [];
      const seen = new Set(
        servers.map((item:any)=>String(item?.serverName || "").trim().toLowerCase())
      );
      const brokerNames = new Set(
        [row.code,row.name].map((value:any)=>String(value || "").trim().toLowerCase())
      );

      for (const item of observed.rows) {
        if (!brokerNames.has(String(item.broker || "").trim().toLowerCase())) continue;
        const serverName = String(item.server_name || "").trim();
        const key = serverName.toLowerCase();
        if (!serverName || seen.has(key)) continue;

        const upper = serverName.toUpperCase();
        const environment = upper.includes("DEMO") || upper.includes("TRIAL")
          ? "DEMO"
          : upper.includes("REAL") || upper.includes("LIVE")
            ? "REAL"
            : "UNKNOWN";
        servers.push({ serverName, environment });
        seen.add(key);
      }

      servers.sort((a:any,b:any) => {
        const envA = String(a?.environment || "UNKNOWN").toUpperCase();
        const envB = String(b?.environment || "UNKNOWN").toUpperCase();
        return (environmentRank[envA] ?? 2) - (environmentRank[envB] ?? 2) ||
          String(a?.serverName || "").localeCompare(
            String(b?.serverName || ""),
            undefined,
            { numeric:true, sensitivity:"base" }
          );
      });

      return { ...row, servers };
    });
  }
}
