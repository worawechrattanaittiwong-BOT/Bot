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
import { DbService } from "./db.service";
import { MaintenanceService } from "./maintenance.service";
import { CloudService, CloudAdminController, CloudCustomerController, CloudPaymentController } from "./cloud.controller";
import { AdminGuard, CryptoService, JwtGuard, WorkerGuard } from "./security";

const INSECURE_JWT_SECRETS = new Set([
  "development-only-change-me",
  "replace-with-long-random-secret"
]);

function jwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";

  if (isProduction && (!secret || secret.length < 32 || INSECURE_JWT_SECRETS.has(secret))) {
    throw new Error(
      "JWT_SECRET must be configured in production with a unique random value of at least 32 characters"
    );
  }

  // Keep local development convenient, but never allow this fallback in production.
  return secret || "development-only-change-me";
}

@Module({
  imports: [
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: "7d" }
    })
  ],
  controllers: [CloudAdminController, CloudCustomerController, CloudPaymentController, RootController, CatalogController, AuthController, BotController, DashboardLiveController, ManualMt5Controller, AdminController, EaController, AgentActionController, InstallerController, BacktestController, PerformanceController, HealthController, WorkerController],
  providers: [CloudService, DbService, MaintenanceService, JwtGuard, AdminGuard, WorkerGuard, CryptoService]
})
export class AppModule {}
