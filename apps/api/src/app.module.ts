import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { BotController } from "./bot.controller";
import { AdminController } from "./admin.controller";
import { EaController } from "./ea.controller";
import { HealthController } from "./health.controller";
import { DbService } from "./db.service";
import { AdminGuard, CryptoService, JwtGuard } from "./security";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "development-only-change-me",
      signOptions: { expiresIn: "7d" }
    })
  ],
  controllers: [AuthController, BotController, AdminController, EaController, HealthController],
  providers: [DbService, JwtGuard, AdminGuard, CryptoService]
})
export class AppModule {}
