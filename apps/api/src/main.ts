import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: process.env.WEB_ORIGIN || "http://localhost:3000",
    credentials: true
  });

  // Keep the API under /api, but leave GET / available so Codespaces users
  // who accidentally open port 4000 are redirected to the web preview on 3000.
  app.setGlobalPrefix("api", {
    exclude: [{ path: "", method: RequestMethod.GET }]
  });

  await app.listen(Number(process.env.PORT || 4000), "0.0.0.0");
}
bootstrap();
