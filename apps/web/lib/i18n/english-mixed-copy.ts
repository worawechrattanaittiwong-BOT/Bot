import dictionaryData from "./customer-visible-translations.json";
const dictionary: Record<string,string> = dictionaryData as Record<string,string>;
const overrides:Record<string,string>={
  "ระดับต่อฝั่ง":"levels per side",
  "ต่อระดับ":"per level",
  "ไม้":"positions",
  "ไม้ต่อฝั่ง":"positions per side",
  "เงินบัญชี":"account currency",
  "สถานะจาก EA":"Status from EA",
  "กำลังตรวจสอบ":"Checking",
  "รอดำเนินการ":"Pending",
  "จำนวนคำสั่งรอต่อฝั่ง":"Pending orders per side",
  "ระยะห่างกริด":"Grid spacing",
  "คำสั่งรอ":"Pending orders",
  "ไม่มีข้อมูล":"No data",
  "ข้อมูลไม่พร้อมใช้งาน":"Data unavailable",
  "กำไร/ขาดทุน":"Profit/Loss"
};
const fragments={...dictionary,...overrides};
const thai=/[ก-๙]/;
const thaiChunk=/[ก-๙]+(?:[\s/·:–-]+[ก-๙]+)*/g;
function translateChunk(chunk:string):string{
 const exact=fragments[chunk.trim()];
 if(exact)return chunk.replace(chunk.trim(),exact);
 // Preserve numerical/trading identifiers and translate only known Thai runs.
 const words=chunk.split(/(\s+|[/:·–-])/);
 return words.map(word=>fragments[word]||word).join("");
}
export function translateEnglishCopy(value:string):string{
 if(!thai.test(value))return value;
 const clean=value.trim();
 const exact=fragments[clean];
 if(exact)return value.replace(clean,exact);
 return value.replace(thaiChunk,translateChunk);
}
