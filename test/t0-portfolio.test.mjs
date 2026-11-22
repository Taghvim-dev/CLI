import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {run} from "../src/cli.mjs";

const idx=JSON.parse(readFileSync(new URL("../contracts/operation-index.json",import.meta.url),"utf8"));
const key="tgv_test_SyntheticPortfolioKey";
function io(){const stdout=[],stderr=[];return{stdout:{write:s=>stdout.push(s)},stderr:{write:s=>stderr.push(s)},lines:stdout,errors:stderr}}
test("T0 CLI operation index uses Engine portfolio operation and exact OpenAPI blob",()=>{
 assert.equal(idx.openApiGitBlobSHA,"12ed37fdbdc5ecd551cf9561855f476a71709078");
 assert.equal(idx.operations.filter(x=>x.operationId==="listCalendarPortfolio"&&x.method==="GET"&&x.path==="/v1/portfolios/calendars"&&x.auth.join()==="ApiKey").length,1);
 assert.equal(idx.operations.filter(x=>x.operationId==="listFinanceCountries"&&x.auth.length===0).length,1);
 assert.equal(idx.operations.filter(x=>x.operationId==="getFinanceBusinessDayQuote"&&x.auth.includes("ApiKey")).length,1);
});
test("T0 CLI portfolio is a single authenticated read and rejects unapproved input before fetch",async()=>{
 const logs=[],h=io();
 const fetchImpl=async(url,init)=>{
  logs.push({url,init});
  return new Response(JSON.stringify({count:0,data:[]}),{status:200,headers:{"content-type":"application/json"}});
 };
 assert.equal(await run(["portfolio","selected"],{...h,env:{TAGHVIM_TEST_API_KEY:key},fetchImpl}),0);
 assert.equal(logs.length,1);
 assert.equal(new URL(logs[0].url).pathname,"/v1/portfolios/calendars");
 assert.equal(new URL(logs[0].url).searchParams.get("scope"),"selected");
 assert.equal(logs[0].init.headers.authorization,"Bearer "+key);
 assert.equal(logs[0].init.method,"GET");
 assert.equal(logs[0].init.body,undefined);
 const second=io();
 assert.equal(await run(["api","listCalendarPortfolio"],{...second,env:{TAGHVIM_TEST_API_KEY:key},fetchImpl,
  input:JSON.stringify({query:{scope:"granted",sector_pack:"healthcare",q:"قلب"},workspaceId:"wsp_hospital_001"})}),0);
 assert.equal(logs.length,2);
 const url=new URL(logs[1].url);
 assert.equal(url.searchParams.get("sector_pack"),"healthcare");
 assert.equal(url.searchParams.get("q"),"قلب");
 assert.equal(logs[1].init.headers["Taghvim-Workspace-Id"],"wsp_hospital_001");
 const bad=io();assert.equal(await run(["portfolio","invalid"],{...bad,env:{TAGHVIM_TEST_API_KEY:key},fetchImpl}),2);
 assert.equal(logs.length,2);
 const denied=io();assert.equal(await run(["portfolio"],{...denied,env:{},fetchImpl}),2);
 assert.equal(logs.length,2);
});
