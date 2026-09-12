import type { Metadata } from "next";
import "./globals.css";
import { CustomerNavigationLabels } from "../components/CustomerNavigationLabels";
import { Mt5AccountSwitchAssistant } from "../components/Mt5AccountSwitchAssistant";
import { Mt5ManualActionControls } from "../components/Mt5ManualActionControls";

export const metadata: Metadata = {
  title: "SCENOVA — MT5 BOT EA",
  description: "ระบบควบคุม MT5 BOT EA ผ่านเว็บและมือถือ รองรับ Cloud และ Local"
};

const compactDashboardCss = `
/* Compact Market Insight + 5s success toast */
.cc-v8-left-stack{
  grid-template-rows:350px 168px!important;
}

.cc-v8-left-stack>.cc-v6-market-insight{
  min-height:0!important;
  height:168px!important;
  grid-template-columns:minmax(200px,.7fr) minmax(0,1.3fr)!important;
  grid-template-rows:36px minmax(0,1fr)!important;
  padding:10px 12px!important;
  gap:0 10px!important;
  border-radius:17px!important;
  border-color:rgba(117,95,211,.42)!important;
  background:
    radial-gradient(circle at 92% 0,rgba(126,84,255,.13),transparent 42%),
    linear-gradient(155deg,#0f1426,#080d18)!important;
  box-shadow:0 14px 34px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.025)!important;
}

.cc-v8-left-stack .cc-v6-market-insight>.cc-v6-panel-head{
  min-height:36px!important;
  padding-bottom:6px!important;
}

.cc-v8-left-stack .cc-v6-market-bias{
  min-height:0!important;
  height:104px!important;
  margin:7px 0 0!important;
  padding:9px 10px!important;
  border-radius:12px!important;
}

.cc-v8-left-stack .cc-v6-market-bias>svg{
  padding:5px!important;
}

.cc-v8-left-stack .cc-v6-market-bias b{
  font-size:13px!important;
}

.cc-v8-left-stack .cc-v6-market-bias span{
  font-size:8px!important;
}

.cc-v8-left-stack .cc-v6-insight-rows{
  margin-top:7px!important;
  border-radius:12px!important;
  overflow:hidden!important;
  align-self:start!important;
}

.cc-v8-left-stack .cc-v6-insight-row{
  min-height:25px!important;
  padding:4px 8px!important;
  grid-template-columns:92px minmax(0,1fr)!important;
}

/* Keep only the decision-critical rows: Entry Quality, Confidence,
   Win Probability and R:R. The signal itself stays in the left bias card. */
.cc-v8-left-stack .cc-v6-insight-row:nth-child(4),
.cc-v8-left-stack .cc-v6-insight-row:nth-child(5),
.cc-v8-left-stack .cc-v6-insight-row:nth-child(n+7){
  display:none!important;
}

/* Success/command notifications stay out of the content flow and disappear in 5s. */
.notice.good.page-notice{
  position:fixed!important;
  top:82px!important;
  right:24px!important;
  z-index:9999!important;
  width:min(430px,calc(100vw - 32px))!important;
  margin:0!important;
  padding:12px 15px!important;
  border-radius:14px!important;
  border-color:rgba(91,190,139,.42)!important;
  background:rgba(11,31,23,.96)!important;
  color:#b8f0d1!important;
  box-shadow:0 18px 48px rgba(0,0,0,.34),0 0 0 1px rgba(108,225,165,.05) inset!important;
  backdrop-filter:blur(16px)!important;
  animation:ccCompactNotice5s 5s ease forwards!important;
}

@keyframes ccCompactNotice5s{
  0%,82%{opacity:1;transform:translateY(0);visibility:visible}
  94%{opacity:0;transform:translateY(-8px);visibility:visible}
  100%{opacity:0;transform:translateY(-8px);visibility:hidden;pointer-events:none}
}

@media(max-width:1240px){
  .cc-v8-left-stack{grid-template-rows:350px 168px!important}
}

@media(max-width:880px){
  .cc-v8-left-stack{grid-template-rows:auto auto!important}
  .cc-v8-left-stack>.cc-v6-market-insight{
    height:auto!important;
    min-height:156px!important;
  }
}

@media(max-width:680px){
  .cc-v8-left-stack>.cc-v6-market-insight{
    grid-template-columns:1fr!important;
    grid-template-rows:auto auto auto!important;
    height:auto!important;
    min-height:0!important;
  }
  .cc-v8-left-stack .cc-v6-market-bias{height:auto!important;min-height:72px!important}
  .notice.good.page-notice{
    top:68px!important;
    right:16px!important;
    left:16px!important;
    width:auto!important;
  }
}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <style>{compactDashboardCss}</style>
        {children}
        <CustomerNavigationLabels />
        <Mt5AccountSwitchAssistant />
        <Mt5ManualActionControls />
      </body>
    </html>
  );
}
