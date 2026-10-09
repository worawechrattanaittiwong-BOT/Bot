const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const cp=require("node:child_process");
const source=fs.readFileSync("scripts/auto-deploy-vps.sh","utf8");
test("generated EA allowlist includes the official symbol probe and excludes other paths",()=>{
  const block=source.match(/validate_generated_ea_shape\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(block,"EA release validation must remain explicit");
  const names=block.match(/mt5\/FastBasketBot\.mq5\|[^\n]+\)/)?.[0]||"";
  for(const needed of ["mt5/FastBasketBot.mq5","mt5/release/FastBasketBot.ex5","mt5/release/ScenovaSymbolProbe.ex5","mt5/release/manifest.json"])
    assert.ok(names.includes(needed),"missing "+needed);
  assert.doesNotMatch(names,/scripts\/|apps\/|\.env|\*\.ex5/);
  assert.match(block,/author_email.*actions@users\.noreply\.github\.com/);
  assert.match(block,/git cat-file -e/);
});
test("official generated EA 1.1.31 release passes exact trusted-shape validator",()=>{
  const probe=cp.spawnSync("git",["cat-file","-t","08a764a43a7c1c585b291fc94977839c3170accd"],{encoding:"utf8"});
  if(probe.status!==0)return; // The release commit is not part of a shallow checkout.
  const functionSource=source.match(/validate_generated_ea_shape\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);
  const result=cp.spawnSync("bash",["-c",functionSource+"\nvalidate_generated_ea_shape 08a764a43a7c1c585b291fc94977839c3170accd"],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
