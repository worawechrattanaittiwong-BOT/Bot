import { redirect } from "next/navigation";

export default function TradingSymbolRedirect() {
  redirect("/dashboard?view=overview");
}
