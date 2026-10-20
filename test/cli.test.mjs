import {test} from "node:test";
import assert from "node:assert/strict";
import {run} from "../src/cli.mjs";
function harness(){const output=[],errors=[];return{output,errors,stdout:{write:x=>output.push(x)},stderr:{write:x=>errors.push(x)}}}
const env={TAGHVIM_TEST_API_KEY:"tgv_test_SyntheticKeyForTests"};
test("help, operations and version are offline without credentials",async()=>{
 const v=harness();assert.equal(await run(["--help"],{...v,env:{},fetchImpl:()=>{throw Error("not called")}}),0);
 assert.match(v.output.join(""),/CLI/);
 const n=harness();assert.equal(await run(["operations"],{...n,env:{}}),0);assert.match(n.output.join(""),/convertDate/);
});
test("convert request sends one scoped test-key POST and emits request ID",async()=>{
 const h=harness();let seen,requestCount=0;
 const code=await run(["convert","1405-07-15"],{...h,env,fetchImpl:async(url,init)=>{
   requestCount++;seen={url,init};
   return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","Taghvim-Request-Id":"req_cli_mock"}});
 }});
 assert.equal(code,0);assert.equal(requestCount,1);
 assert.equal(seen.url,"https://api.taghvim.dev/v1/dates/convert");
 assert.equal(seen.init.headers.authorization,"Bearer "+env.TAGHVIM_TEST_API_KEY);
 assert.deepEqual(JSON.parse(seen.init.body),{date:"1405-07-15"});
 assert.match(h.output.join(""),/req_cli_mock/);
});
test("public health has no Authorization and no key required",async()=>{
 const h=harness();let auth;
 assert.equal(await run(["health"],{...h,env:{},fetchImpl:async(_,opts)=>{auth=opts.headers.authorization;return new Response('{"ok":true}',{headers:{"content-type":"application/json"}})}}),0);
 assert.equal(auth,undefined);
});
test("refuses live keys by default and bad arguments before network activity",async()=>{
 let count=0;const transport=async()=>{count++;return new Response("{}")};
 const h=harness();
 assert.equal(await run(["convert","1405-07-15"],{...h,env:{TAGHVIM_TEST_API_KEY:"tgv_live_x"},fetchImpl:transport}),2);
 assert.equal(await run(["business-days","add","1405-07-15","abc"],{...h,env,fetchImpl:transport}),2);
 assert.equal(await run(["holidays","1405","13"],{...h,env,fetchImpl:transport}),2);
 assert.equal(await run(["convert","1405-07-15","--key=secret"],{...h,env,fetchImpl:transport}),2);
 assert.equal(count,0);
});
test("live use requires explicit --live plus an isolated live environment variable",async()=>{
 let auth;const h=harness();
 const code=await run(["--live","usage"],{...h,env:{TAGHVIM_LIVE_API_KEY:"tgv_live_SyntheticTest"},fetchImpl:async(_,opts)=>{auth=opts.headers.authorization;return new Response("{}",{headers:{"content-type":"application/json"}})}});
 assert.equal(code,0);assert.equal(auth,"Bearer tgv_live_SyntheticTest");
});
test("returns structured errors and never writes bearer secrets to stderr",async()=>{
 const h=harness();
 const code=await run(["usage"],{...h,env,fetchImpl:async()=>new Response(JSON.stringify({code:"quota_exceeded",title:"Quota"}),{status:429,headers:{"content-type":"application/json","Retry-After":"90","Taghvim-Request-Id":"req_429"}})});
 assert.equal(code,1);
 assert.match(h.errors.join(""),/quota_exceeded/);
 assert.match(h.errors.join(""),/req_429/);
 assert.ok(!h.errors.join("").includes(env.TAGHVIM_TEST_API_KEY));
});
