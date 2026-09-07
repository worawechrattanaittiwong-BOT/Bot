import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { BotController } from "./bot.controller";
import { AdminController } from "./admin.controller";
import { EaController } from "./ea.controller";
import { HealthController } from "./health.controller";
import { WorkerController } from "./worker.controller";
import { RootController } from "./root.controller";
import { CatalogController } from "./catalog.controller";
import { InstallerController } from "./installer.controller";
import { DbService } from "./db.service";
import { AdminGuard, CryptoService, JwtGuard, WorkerGuard } from "./security";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "development-only-change-me",
      signOptions: { expiresIn: "7d" }
    })
  ],
  controllers: [RootController, CatalogController, AuthController, BotController, AdminController, EaController, InstallerController, HealthController, WorkerController],
  providers: [DbService, JwtGuard, AdminGuard, WorkerGuard, CryptoService]
})
export class AppModule {}
