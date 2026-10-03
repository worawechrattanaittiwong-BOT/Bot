import { Controller, Get } from "@nestjs/common";
import { DbService } from "./db.service";

@Controller("catalog")
export class CatalogController {
  constructor(private readonly db: DbService) {}

  @Get("brokers")
  async brokers() {
    const [brokers, directory] = await Promise.all([
      this.db.query(
        `SELECT code,name
         FROM brokers
         WHERE active=true
         ORDER BY sort_order,name`
      ),
      this.db.query(
        `SELECT
           upper(item->>'brokerCode') AS broker_code,
           item->>'serverName' AS server_name,
           upper(COALESCE(NULLIF(item->>'environment',''),'UNKNOWN')) AS environment
         FROM worker_nodes w
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(w.telemetry->'brokerServers')='array'
               THEN w.telemetry->'brokerServers'
             ELSE '[]'::jsonb
           END
         ) item
         WHERE w.status='ONLINE'
           AND w.last_seen_at>now()-interval '90 seconds'
           AND COALESCE(item->>'brokerCode','')<>''
           AND COALESCE(item->>'serverName','')<>''`
      )
    ]);

    const byBroker = new Map<string,Map<string,{serverName:string;environment:string;source:string}>>();
    for (const item of directory.rows) {
      const brokerCode = String(item.broker_code || "").trim().toUpperCase();
      const serverName = String(item.server_name || "").trim();
      if (!brokerCode || !serverName) continue;

      const environmentRaw = String(item.environment || "UNKNOWN").toUpperCase();
      const environment = ["REAL","DEMO","UNKNOWN"].includes(environmentRaw)
        ? environmentRaw
        : "UNKNOWN";

      if (!byBroker.has(brokerCode)) byBroker.set(brokerCode,new Map());
      const servers = byBroker.get(brokerCode)!;
      const key = serverName.toLowerCase();
      if (!servers.has(key)) {
        servers.set(key,{
          serverName,
          environment,
          source:"BROKER_MT5_DIRECTORY"
        });
      }
    }

    const rank:Record<string,number> = { REAL:0, DEMO:1, UNKNOWN:2 };
    return brokers.rows.map((broker:any) => {
      const code = String(broker.code || "").toUpperCase();
      const servers = Array.from(byBroker.get(code)?.values() || []);
      servers.sort((a,b) =>
        (rank[a.environment] ?? 2) - (rank[b.environment] ?? 2) ||
        a.serverName.localeCompare(b.serverName,undefined,{
          numeric:true,
          sensitivity:"base"
        })
      );
      return {
        code:broker.code,
        name:broker.name,
        servers
      };
    });
  }
}
