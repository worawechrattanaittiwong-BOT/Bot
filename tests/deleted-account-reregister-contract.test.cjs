const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");

class ConflictException extends Error {}

function extractMethod(path,className,methodName,dependencies={}) {
  const src=fs.readFileSync(path,"utf8");
  const ast=ts.createSourceFile(path,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text===className);
  assert.ok(cls,className+" should be available");
  const m=cls.members.find(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)===methodName);
  assert.ok(m,methodName+" should exist");
  const helpers=dependencies.helpers||"";
  const code="class Probe {constructor(db){this.db=db;} "+helpers+"\n"+m.getText(ast)+"}\nmodule.exports=Probe;";
  const compiled=ts.transpileModule(code,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
      experimentalDecorators:true}
  }).outputText;
  const mod={exports:{}};
  new Function("module","Post","Body","Req","ConflictException","hash",compiled)(
    mod,()=>()=>{},()=>()=>{},()=>()=>{},ConflictException,async()=> "hashed"
  );
  return mod.exports;
}

const AdminProbe=extractMethod("apps/api/src/admin.controller.ts","AdminController","deleteUser");
const AuthProbe=extractMethod("apps/api/src/auth.controller.ts","AuthController","register",{
  helpers:`
  verificationRequired(){return false;}
  publicUser(user){return user;}
  tokenFor(){return "test-token";}
  async authEvent(){}
  `
});

function deletionHarness({role="USER",state="OFFLINE",desired="SAFE_STOP",
  runtimeStop="STOP_CONFIRMED",activeCount=0,failAt=""}={}) {
  const events=[];
  const user={id:"user-1",user_code:"BOT-EXAMPLE",email:"customer@example.com",
    role,status:"ACTIVE"};
  const db={transaction:async work=>{
    events.push(["BEGIN"]);
    try {
      const result=await work({query:async(sql,args=[])=>{
        events.push([sql,args]);
        if(failAt && sql.includes(failAt)) throw Error("injected db failure");
        if(sql.includes("FROM users WHERE id=$1 FOR UPDATE"))return {rows:[user]};
        if(sql.includes("count(*)::int active_count"))return {rows:[{active_count:activeCount}]};
        if(sql.includes("SELECT DISTINCT bi.id"))return {rows:[{
          id:"bot-1",actual_state:state,desired_state:desired,runtime_stop_state:runtimeStop
        }]};
        return {rows:[],rowCount:1};
      }});
      events.push(["COMMIT"]);
      return result;
    }catch(e){events.push(["ROLLBACK"]);throw e;}
  }};
  return {probe:new AdminProbe(db),events};
}

test("confirmed offline bot is not re-queued for SAFE_STOP on deletion",async()=>{
  const h=deletionHarness();
  assert.deepEqual(await h.probe.deleteUser({userId:"user-1"}),{ok:true});
  const statements=h.events.map(e=>e[0]).join("\n");
  assert.doesNotMatch(statements,/INSERT INTO bot_commands/);
  assert.match(statements,/AND status<>'DELETED'/);
  assert.match(statements,/email='deleted\.' \|\| id::text/);
  assert.match(statements,/INSERT INTO audit_logs/);
  assert.equal(h.events.at(-1)[0],"COMMIT");
});

test("unconfirmed bot still receives the original SAFE_STOP safety command",async()=>{
  const h=deletionHarness({runtimeStop:"PENDING"});
  await h.probe.deleteUser({userId:"user-1"});
  assert.match(h.events.map(e=>e[0]).join("\n"),/INSERT INTO bot_commands/);
});

test("running bot blocks deletion without any mutations",async()=>{
  const h=deletionHarness({activeCount:1});
  await assert.rejects(h.probe.deleteUser({userId:"user-1"}),ConflictException);
  assert.equal(h.events.at(-1)[0],"ROLLBACK");
  assert.doesNotMatch(h.events.map(e=>e[0]).join("\n"),/UPDATE users SET/);
});

test("OWNER / ADMIN accounts stay protected",async()=>{
  for(const role of ["OWNER","ADMIN"]){
    const h=deletionHarness({role});
    await assert.rejects(h.probe.deleteUser({userId:"user-1"}),ConflictException);
    assert.equal(h.events.at(-1)[0],"ROLLBACK");
  }
});

test("failure in deletion is rolled back, not a partially deleted user",async()=>{
  const h=deletionHarness({failAt:"UPDATE users SET status='DELETED'"});
  await assert.rejects(h.probe.deleteUser({userId:"user-1"}),/injected db failure/);
  assert.equal(h.events.at(-1)[0],"ROLLBACK");
  assert.doesNotMatch(h.events.map(e=>e[0]).join("\n"),/COMMIT/);
});

test("trial records are preserved, and audit keeps original email",async()=>{
  const h=deletionHarness();
  await h.probe.deleteUser({userId:"user-1"});
  const statements=h.events.map(e=>e[0]).join("\n");
  assert.doesNotMatch(statements,/DELETE FROM (users|trial_grants|mt5_accounts|trial_authorizations)/);
  const audit=h.events.find(e=>e[0].includes("INSERT INTO audit_logs"));
  assert.equal(JSON.parse(audit[1][4]).email,"customer@example.com");
  assert.equal(JSON.parse(audit[1][4]).preservedTrialHistory,true);
});

function registrationHarness({existingStatus="DELETED",releasedCount=1}={}){
  const calls=[];
  const db={
    one:async(sql,args=[])=>{
      calls.push([sql,args]);
      if(sql.includes("SELECT id,status FROM users WHERE email"))return existingStatus
        ? {id:"archived-1",status:existingStatus}:null;
      if(sql.includes("INSERT INTO users"))return {
        id:"new-1",user_code:"BOT-NEW",email:"customer@example.com",
        role:"USER",status:"ACTIVE",email_verified_at:new Date()
      };
      return null;
    },
    query:async(sql,args=[])=>{
      calls.push([sql,args]);
      return {rowCount:releasedCount};
    }
  };
  return {probe:new AuthProbe(db),calls};
}

test("legacy DELETED email can be released for a new sign-up",async()=>{
  const h=registrationHarness();
  const result=await h.probe.register({},{
    email:"Customer@Example.com",password:"long-password"
  });
  assert.equal(result.user.id,"new-1");
  const tombstone=h.calls.find(e=>e[0].includes("UPDATE users SET email='deleted.'"));
  assert.ok(tombstone);
  assert.deepEqual(tombstone[1],["archived-1","customer@example.com"]);
  assert.match(tombstone[0],/status='DELETED'/);
  assert.match(h.calls.map(e=>e[0]).join("\n"),/INSERT INTO users/);
});

test("ACTIVE or SUSPENDED email cannot be taken via registration",async()=>{
  for(const status of ["ACTIVE","SUSPENDED"]){
    const h=registrationHarness({existingStatus:status});
    await assert.rejects(h.probe.register({},{
      email:"customer@example.com",password:"long-password"
    }),ConflictException);
    assert.equal(h.calls.some(e=>e[0].includes("UPDATE users SET email")),false);
  }
});

test("concurrent release losing the race cannot register against stale state",async()=>{
  const h=registrationHarness({releasedCount:0});
  await assert.rejects(h.probe.register({},{
    email:"customer@example.com",password:"long-password"
  }),ConflictException);
  assert.equal(h.calls.some(e=>e[0].includes("INSERT INTO users")),false);
});
