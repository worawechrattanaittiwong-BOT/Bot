import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../security";
import { ExnessRebateService } from "./exness-rebate.service";

@Controller("admin/brokers/exness/rebate-control")
@UseGuards(AdminGuard)
export class ExnessRebateController {
  constructor(private readonly svc:ExnessRebateService) {}
  private actor(req:any){return req.user?.sub ? "ADMIN:"+String(req.user.sub) : "EMERGENCY_ADMIN";}
  @Get(":name")
  read(@Param("name") name:string,@Query("limit") limit?:string,@Query("offset") offset?:string) {
    if(!["groups","clients","rebates","payments","history"].includes(name))throw new BadRequestException("รายงานไม่ถูกต้อง");
    return this.svc.read(name as "groups"|"clients"|"rebates"|"payments"|"history",limit===undefined?40:Number(limit),offset===undefined?0:Number(offset));
  }
  @Put("client")
  updateClient(@Req() req:any,@Body() body:{clientAccount?:string;percent?:number;destinationClientAccount?:string}) {
    return this.svc.setClient(body||{},this.actor(req));
  }
  @Post("approve/start")
  start(@Req() req:any,@Body() body:{rebates?:unknown;rebateRows?:unknown}) {
    return this.svc.start(body||{},this.actor(req));
  }
  @Post("approve/complete")
  complete(@Req() req:any,@Body() body:{attemptId?:string;verificationToken?:string}) {
    return this.svc.complete(body||{},this.actor(req));
  }
}
