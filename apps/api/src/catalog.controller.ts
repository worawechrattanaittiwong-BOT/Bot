import { Controller, Get } from "@nestjs/common";
import { DbService } from "./db.service";

@Controller("catalog")
export class CatalogController {
  constructor(private readonly db: DbService) {}

  @Get("brokers")
  async brokers() {
    const [rows,liveDirectory] = await Promise.all([
      this.db.query(
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

    const rank:Record<string,number> = { REAL:0, DEMO:1, UNKNOWN:2 };
    const liveByBroker = new Map<string,Map<string,{serverName:string;environment:string}>>();

    for (const item of liveDirectory.rows) {
      const brokerCode = String(item.broker_code || "").trim().toUpperCase();
      const serverName = String(item.server_name || "").trim();
      if (!brokerCode || !serverName) continue;

      const environmentRaw = String(item.environment || "UNKNOWN").toUpperCase();
      const environment = ["REAL","DEMO","UNKNOWN"].includes(environmentRaw)
        ? environmentRaw
        : "UNKNOWN";

      if (!liveByBroker.has(brokerCode)) liveByBroker.set(brokerCode,new Map());
      liveByBroker.get(brokerCode)!.set(serverName.toLowerCase(),{ serverName,environment });
    }

    return rows.rows.map((row:any) => {
      const code = String(row.code || "").toUpperCase();
      const live = Array.from(liveByBroker.get(code)?.values() || []);

      if (code === "VANTAGE") {
        // This catalog represents MT5 broker item #6 only:
        // Vantage Markets (Pty) Ltd / VantageMarkets, not VantageMarketsMU.
        const isPtyServer = (name:string) =>
          /^VantageMarkets-(?:Live|Demo)(?: [0-9]{1,3})?$/i.test(name);
        // For Vantage only, keep the official verified catalog visible even
        // when one connected Worker knows only a subset of MT5 servers.
        // Other brokers retain their existing live-directory preference.
        const all = new Map<string,{serverName:string;environment:string}>();
        for (const item of Array.isArray(row.servers) ? row.servers : []) {
          const serverName = String(item.serverName || "").trim();
          if (isPtyServer(serverName)) all.set(serverName.toLowerCase(),{
            serverName,
            environment:String(item.environment || "UNKNOWN").toUpperCase()
          });
        }
        for (const item of live) {
          // Only include server names from the VantageMarkets company family.
          if (isPtyServer(item.serverName)) all.set(item.serverName.toLowerCase(),item);
        }
        const servers = Array.from(all.values()).sort((a,b) =>
          (rank[a.environment] ?? 2) - (rank[b.environment] ?? 2) ||
          a.serverName.localeCompare(b.serverName,undefined,{ numeric:true,sensitivity:"base" })
        );
        return {
          ...row,
          servers,
          serverSource:live.some(item => isPtyServer(item.serverName)) ? "VERIFIED_CATALOG_AND_BROKER_MT5_DIRECTORY" : "VERIFIED_CATALOG"
        };
      }

      if (!live.length) return row;

      live.sort((a,b) =>
        (rank[a.environment] ?? 2) - (rank[b.environment] ?? 2) ||
        a.serverName.localeCompare(b.serverName,undefined,{ numeric:true,sensitivity:"base" })
      );

      return {
        ...row,
        servers:live,
        serverSource:"BROKER_MT5_DIRECTORY"
      };
    });
  }
}
