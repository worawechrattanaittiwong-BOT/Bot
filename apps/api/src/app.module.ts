import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AccountSecurityController } from "./account-security.controller";
import { BotController } from "./bot.controller";
import { AdminController } from "./admin.controller";
import { AdminServiceLinksController } from "./admin-service-links.controller";
import { AdminApiCredentialsController } from "./admin-api-credentials.controller";
import { RuntimeSecretsService } from "./runtime-secrets.service";
import { ApiCredentialTesterService } from "./api-credential-tester.service";
import { EaController } from "./ea.controller";
import { AgentActionController } from "./agent-action.controller";
import { ManualMt5Controller } from "./manual-mt5.controller";
import { ManualEaUpdateStopInterceptor } from "./manual-ea-update.interceptor";
import { TradingSymbolController, EaTradingSymbolController } from "./trading-symbol.controller";
import { TradingSymbolStartInterceptor } from "./trading-symbol.interceptor";
import { HealthController } from "./health.controller";
import { WorkerController } from "./worker.controller";
import { RootController } from "./root.controller";
import { CatalogController } from "./catalog.controller";
import { InstallerController } from "./installer.controller";
import { BacktestController, PerformanceController } from "./backtest.controller";
import { PerformanceAnalyticsController } from "./performance-analytics.controller";
import { PerformanceActionsController, SharedPerformanceController } from "./performance-actions.controller";
import { DashboardLiveController } from "./dashboard-live.controller";
import { PartnerController } from "./partner.controller";
import { PartnerService } from "./partner.service";
import { ReferralController } from "./referral.controller";
import { ReferralService } from "./referral.service";
import { TrialAuthorizationService } from "./trial-authorization.service";
import { TrialCouponController } from "./trial-coupon.controller";
import { SmsService } from "./sms.service";
import { DbService } from "./db.service";
import { MaintenanceService } from "./maintenance.service";
import { CloudService, CloudAdminController, CloudCustomerController, CloudPaymentController } from "./cloud.controller";
import { LocalPackageService, LocalPackageCustomerController, LocalPackageAdminController } from "./local-package.controller";
import { CloudTestController } from "./cloud-test.controller";
import { RuntimeSafetyController } from "./runtime-safety.controller";
import { RuntimeSafetyService } from "./runtime-safety.service";
import { RuntimeMigrationController, RuntimeMigrationAgentController } from "./runtime-migration.controller";
import { RuntimeMigrationService } from "./runtime-migration.service";
import { ProductionHardeningController } from "./production-hardening.controller";
import { ProductionHardeningService } from "./production-hardening.service";
import { AdminGuard, CryptoService, JwtGuard, WorkerGuard } from "./security";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "development-only-change-me",
      signOptions: { expiresIn: "7d" }
    })
  ],
  controllers: [AdminApiCredentialsController, AdminServiceLinksController, ProductionHardeningController, RuntimeMigrationController, RuntimeMigrationAgentController, RuntimeSafetyController, CloudTestController, CloudAdminController, CloudCustomerController, CloudPaymentController, LocalPackageCustomerController, LocalPackageAdminController, RootController, CatalogController, AuthController, AccountSecurityController, TrialCouponController, BotController, DashboardLiveController, PartnerController, ReferralController, ManualMt5Controller, TradingSymbolController, EaTradingSymbolController, AdminController, EaController, AgentActionController, InstallerController, BacktestController, PerformanceController, PerformanceAnalyticsController, PerformanceActionsController, SharedPerformanceController, HealthController, WorkerController],
  providers: [
    ApiCredentialTesterService,
    RuntimeSecretsService,
    ProductionHardeningService,
    RuntimeMigrationService,
    RuntimeSafetyService,
    CloudService,
    LocalPackageService,
    DbService,
    MaintenanceService,
    PartnerService,
    ReferralService,
    TrialAuthorizationService,
    SmsService,
    JwtGuard,
    AdminGuard,
    WorkerGuard,
    CryptoService,
    { provide: APP_INTERCEPTOR, useClass: TradingSymbolStartInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ManualEaUpdateStopInterceptor }
  ]
})
export class AppModule {}
