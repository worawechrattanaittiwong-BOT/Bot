import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { BotController } from "./bot.controller";
import { AdminController } from "./admin.controller";
import { EaController } from "./ea.controller";
import { AgentActionController } from "./agent-action.controller";
import { ManualMt5Controller } from "./manual-mt5.controller";
import { HealthController } from "./health.controller";
import { WorkerController } from "./worker.controller";
import { RootController } from "./root.controller";
import { CatalogController } from "./catalog.controller";
import { InstallerController } from "./installer.controller";
import { BacktestController, PerformanceController } from "./backtest.controller";
import { DashboardLiveController } from "./dashboard-live.controller";
import { PartnerController } from "./partner.controller";
import { PartnerService } from "./partner.service";
import { DbService } from "./db.service";
import { MaintenanceService } from "./maintenance.service";
import { CloudService, CloudAdminController, CloudCustomerController, CloudPaymentController } from "./cloud.controller";
import { AdminGuard, CryptoService, JwtGuard, WorkerGuard } from "./security";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "development-only-change-me",
      signOptions: { expiresIn: "7d" }
    })
  ],
  controllers: [CloudAdminController, CloudCustomerController, CloudPaymentController, RootController, CatalogController, AuthController, BotController, DashboardLiveController, PartnerController, ManualMt5Controller, AdminController, EaController, AgentActionController, InstallerController, BacktestController, PerformanceController, HealthController, WorkerController],
  providers: [CloudService, DbService, MaintenanceService, PartnerService, JwtGuard, AdminGuard, WorkerGuard, CryptoService]
})
export class AppModule {}
