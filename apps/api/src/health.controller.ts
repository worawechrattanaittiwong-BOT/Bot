import { Controller, Get } from "@nestjs/common";
import { DbService } from "./db.service";

@Controller("health")
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  async health() {
    const db = await this.db.one("SELECT now() AS now");
    return { ok: true, service: "bot-api", databaseTime: db?.now };
  }
}
