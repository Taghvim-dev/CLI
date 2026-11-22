// SPDX-License-Identifier: Apache-2.0
// Taghvim.dev CLI: zero runtime dependencies; no tokens in arguments, config files or logs.
import {readFileSync} from "node:fs";
const contract=JSON.parse(readFileSync(new URL("../contracts/operation-index.json",import.meta.url),"utf8"));
const BASE="https://api.taghvim.dev";
export const HELP=`تقویم.dev — CLI آزمایشی (دسترسی با دعوت‌نامه)
Usage: taghvim [--live] <command> [arguments]

Commands:
  health                                  Check public API health
  versions                                Inspect advertised API versions
  convert <date>                          Convert a Jalali/Gregorian/Hijri date
  business-days add <date> <integer>      Add or subtract business days
  holidays <year> [month]                 List holidays for a Jalali year/month
  finance countries                       List ISO249 countries (NOT verified)
  finance quote <date> <markets> <days>    Read-only verified-source market preview
  schedule-preview <from> <rule> <count>  Preview upcoming occurrences
  portfolio [granted|selected]            List explicitly granted calendar Workspaces
  usage [period]                          Read current usage or YYYY-MM period
  api <operationId>                       Invoke a canonical operation using JSON on STDIN
  operations                              Print the bundled public API operation index
  help                                    Show this help
  version                                 Show CLI/contract version

By default, authenticated commands require TAGHVIM_TEST_API_KEY=tgv_test_....
For explicit live use, pass --live and set TAGHVIM_LIVE_API_KEY=tgv_live_....
Do not paste credentials into command arguments, URLs or public logs.
This preview does not create developer accounts or issue API keys.`;
function fail(message,code=2){const e=new Error(message);e.exitCode=code;throw e}
function integer(text,{min,max,name}){
 if(typeof text!=="string" || !/^-?(0|[1-9][0-9]*)$/.test(text))fail(name+" must be an integer");
 const n=Number(text);
 if(!Number.isSafeInteger(n)||(min!==undefined&&n<min)||(max!==undefined&&n>max))fail(name+" out of allowed range");
 return n;
}
function date(value,name="date"){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))fail(name+" must be YYYY-MM-DD");return value}
function route(args){
 const [cmd,sub,...rest]=args;
 const valid=(n)=>{if(rest.length!==n)fail("Unexpected or missing command arguments")};
 if(cmd==="health" && !sub){return {method:"GET",path:"/v1/health",public:true}}
 if(cmd==="versions"&&!sub){return {method:"GET",path:"/v1/versions",public:true}}
 if(cmd==="convert"&&sub&&!rest.length){return {method:"POST",path:"/v1/dates/convert",body:{date:date(sub)}}}
 if(cmd==="business-days"&&sub==="add"){valid(2);return {method:"POST",path:"/v1/business-days/add",body:{date:date(rest[0]),days:integer(rest[1],{min:-10000,max:10000,name:"days"})}}}
 if(cmd==="holidays"&&sub){if(rest.length>1)fail("Unexpected arguments");const y=integer(sub,{min:1300,max:1500,name:"year"});const q=new URLSearchParams({year:String(y)});if(rest.length)q.set("month",String(integer(rest[0],{min:1,max:12,name:"month"})));return {method:"GET",path:"/v1/holidays?"+q.toString()}}
 if(cmd==="schedule-preview"&&sub){valid(2);const allowed=["last-business","daily","weekly","monthly"];if(!allowed.includes(rest[0]))fail("Unsupported rule (supported: "+allowed.join(", ")+")");return {method:"POST",path:"/v1/schedules/preview",body:{from:date(sub,"from"),rule:rest[0],count:integer(rest[1],{min:1,max:100,name:"count"})}}}
 if(cmd==="finance"&&sub==="countries"){valid(0);return{method:"GET",path:"/v1/finance/countries",public:true}}
 if(cmd==="finance"&&sub==="quote"){
  valid(3);
  const markets=rest[1];
  if(!/^[A-Z]{2}(?:-[A-Z0-9]{2,4})?(?:,[A-Z]{2}(?:-[A-Z0-9]{2,4})?){0,4}$/.test(markets||""))fail("Market list must be 1-5 comma-separated ISO market IDs");
  const selected=markets.split(",");
  if(new Set(selected).size!==selected.length)fail("Duplicate market IDs forbidden");
  return{method:"POST",path:"/v1/finance/business-days/quote",
   body:{date:date(rest[0]),markets:selected,
    offset_business_days:integer(rest[2],{min:0,max:366,name:"business day offset"})}};
 }
 if(cmd==="portfolio"){if(rest.length||sub&&!["granted","selected"].includes(sub))fail("Portfolio scope must be granted or selected");return {method:"GET",path:"/v1/portfolios/calendars?scope="+(sub||"granted")}}
 if(cmd==="usage"){if(rest.length||sub&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(sub))fail("period must be YYYY-MM");return {method:"GET",path:"/v1/usage"+(sub?"?period="+encodeURIComponent(sub):"")}}
 fail("Unknown command. Run taghvim help.");
}

const GA_IDEMPOTENT=new Set(["applyHandle","createWorkspace","createCalendarEvent","updateCalendarEvent",
 "subscribeCalendar","setCalendarNotificationPreferences"]);
const STRICT_ID=/^[A-Za-z][A-Za-z0-9_.:-]{3,159}$/;
/** Canonical operation is selected by name; path/body/query data ONLY from
 * bounded stdin, never from command arguments or a second route registry.
 */
async function routeCanonical(args,{input,stdin}){
 if(args.length!==2||args[0]!=="api")fail("Usage: taghvim api <operationId> (JSON request on stdin)");
 const op=contract.operations.find(o=>o.operationId===args[1]);
 if(!op)fail("Operation not in pinned canonical public contract");
 let raw=input;
 if(raw===undefined){
  let size=0;raw="";
  for await(const chunk of stdin){
   size+=Buffer.byteLength(chunk);
   if(size>16384)fail("Canonical operation input too large");
   raw+=chunk.toString("utf8");
  }
 }
 if(typeof raw!=="string"||!raw.trim()||Buffer.byteLength(raw)>16384)fail("Canonical operation needs JSON on stdin (max 16 KiB)");
 let request;
 try{request=JSON.parse(raw)}catch{fail("Invalid canonical JSON input")}
 if(!request||typeof request!=="object"||Array.isArray(request)||Object.keys(request).some(k=>!["body","params","query","workspaceId","idempotencyKey"].includes(k)))
  fail("Invalid canonical operation request envelope");
 let path=op.path;
 const required=[...path.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]);
 if(request.params!==undefined&&(!request.params||typeof request.params!=="object"||Array.isArray(request.params)||Object.keys(request.params).some(k=>!required.includes(k))))
  fail("Invalid operation path parameters");
 for(const key of required){
  const value=request.params?.[key];
  if(typeof value!=="string"||!STRICT_ID.test(value))fail("Invalid canonical path parameter: "+key);
  path=path.replace("{"+key+"}",encodeURIComponent(value));
 }
 if(request.workspaceId!==undefined&&
   (typeof request.workspaceId!=="string"||!/^[A-Za-z][A-Za-z0-9_:-]{3,127}$/.test(request.workspaceId)))
  fail("Invalid Workspace selector");
 if(request.query!==undefined&&(!request.query||typeof request.query!=="object"||Array.isArray(request.query)||
   Object.values(request.query).some(v=>v!==null&&!["string","number","boolean"].includes(typeof v))))
  fail("Invalid API query");
 if(op.method==="GET"&&request.body!==undefined)fail("GET cannot carry body");
 if(GA_IDEMPOTENT.has(op.operationId)&&(!request.idempotencyKey||typeof request.idempotencyKey!=="string"))
  fail("State-changing operation requires Idempotency-Key");
 if(request.idempotencyKey!==undefined&&
  (typeof request.idempotencyKey!=="string"||request.idempotencyKey.length<8||request.idempotencyKey.length>128||
   !/^[\x21-\x7E]+$/.test(request.idempotencyKey)))fail("Invalid Idempotency-Key");
 return {method:op.method,path,body:request.body,query:request.query,
  idempotencyKey:request.idempotencyKey,workspaceId:request.workspaceId,
  public:op.auth.length===0,contractOperation:op};
}

export async function run(argv,{env=process.env,fetchImpl=globalThis.fetch,stdout=process.stdout,stderr=process.stderr,input,stdin=process.stdin}={}){
 try{
  if(argv.some(x=>x.startsWith("--")&&x!=="--live"&&x!=="--help"&&x!=="--version"))fail("Unknown option");
  const live=argv.includes("--live"), args=argv.filter(x=>x!=="--live");
  const [command]=args;
  if(!command||command==="help"||command==="--help"){stdout.write(HELP+"\n");return 0}
  if(command==="version"||command==="--version"){stdout.write(JSON.stringify({cli:"0.1.0-preview.0",apiContract:contract.contractVersion,openApiGitBlobSHA:contract.openApiGitBlobSHA})+"\n");return 0}
  if(command==="operations"){stdout.write(JSON.stringify(contract,null,2)+"\n");return 0}
  const spec=command==="api"?await routeCanonical(args,{input,stdin}):route(args);
  const op=spec.contractOperation||contract.operations.find(x=>x.method===spec.method&&x.path===spec.path.split("?")[0]);
  if(!op)fail("Operation not in pinned public contract");
  const key=live?env.TAGHVIM_LIVE_API_KEY:env.TAGHVIM_TEST_API_KEY;
  if(!spec.public&&(!key||typeof key!=="string"||!key.startsWith(live?"tgv_live_":"tgv_test_")))fail("An authorized "+(live?"live":"test")+" key in an environment variable is required");
  const raw=env.TAGHVIM_API_BASE_URL||BASE;
  let base;try{base=new URL(raw)}catch{fail("Invalid API URL")}
  if((base.protocol!=="https:"&&!(base.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(base.hostname)))||base.username||base.password||base.search||base.hash)fail("A clean HTTPS API URL is required");
  const url=new URL(spec.path,base);
  if(spec.query)for(const [key,value] of Object.entries(spec.query)){
    if(value!==null)url.searchParams.set(key,String(value));
  }
  const headers={accept:"application/json"};
  if(spec.idempotencyKey)headers["idempotency-key"]=spec.idempotencyKey;
  if(spec.workspaceId)headers["Taghvim-Workspace-Id"]=spec.workspaceId;
  if(!spec.public)headers.authorization="Bearer "+key;
  if(spec.body)headers["content-type"]="application/json";
  let response;
  try{response=await fetchImpl(url.toString(),{method:spec.method,headers,body:spec.body?JSON.stringify(spec.body):undefined,signal:AbortSignal.timeout(15000)})}
  catch(e){fail("API request failed to connect ("+(e?.name==="TimeoutError"?"timeout":"network error")+")",3)}
  const ct=response.headers.get("content-type")||"";
  const result=ct.includes("json")?await response.json().catch(()=>null):await response.text().catch(()=>"");
  const requestId=response.headers.get("Taghvim-Request-Id");
  if(!response.ok){
    stderr.write(JSON.stringify({status:response.status,code:result?.code||"http_error",message:result?.title||"Request rejected",requestId,retryAfter:response.headers.get("Retry-After")})+"\n");
    return 1;
  }
  stdout.write(JSON.stringify({data:result,status:response.status,requestId,rateLimit:response.headers.get("RateLimit")},null,2)+"\n");
  return 0;
 }catch(e){stderr.write("taghvim: "+(e?.message||"Unexpected error")+"\n");return e.exitCode??2}
}
