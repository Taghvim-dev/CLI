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
  schedule-preview <from> <rule> <count>  Preview upcoming occurrences
  usage [period]                          Read current usage or YYYY-MM period
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
 if(cmd==="usage"){if(rest.length||sub&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(sub))fail("period must be YYYY-MM");return {method:"GET",path:"/v1/usage"+(sub?"?period="+encodeURIComponent(sub):"")}}
 fail("Unknown command. Run taghvim help.");
}
export async function run(argv,{env=process.env,fetchImpl=globalThis.fetch,stdout=process.stdout,stderr=process.stderr}={}){
 try{
  if(argv.some(x=>x.startsWith("--")&&x!=="--live"&&x!=="--help"&&x!=="--version"))fail("Unknown option");
  const live=argv.includes("--live"), args=argv.filter(x=>x!=="--live");
  const [command]=args;
  if(!command||command==="help"||command==="--help"){stdout.write(HELP+"\n");return 0}
  if(command==="version"||command==="--version"){stdout.write(JSON.stringify({cli:"0.1.0-preview.0",apiContract:contract.contractVersion,openApiGitBlobSHA:contract.openApiGitBlobSHA})+"\n");return 0}
  if(command==="operations"){stdout.write(JSON.stringify(contract,null,2)+"\n");return 0}
  const spec=route(args);
  const op=contract.operations.find(x=>x.method===spec.method&&x.path===spec.path.split("?")[0]);
  if(!op)fail("Operation not in pinned public contract");
  const key=live?env.TAGHVIM_LIVE_API_KEY:env.TAGHVIM_TEST_API_KEY;
  if(!spec.public&&(!key||typeof key!=="string"||!key.startsWith(live?"tgv_live_":"tgv_test_")))fail("An authorized "+(live?"live":"test")+" key in an environment variable is required");
  const raw=env.TAGHVIM_API_BASE_URL||BASE;
  let base;try{base=new URL(raw)}catch{fail("Invalid API URL")}
  if((base.protocol!=="https:"&&!(base.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(base.hostname)))||base.username||base.password||base.search||base.hash)fail("A clean HTTPS API URL is required");
  const url=new URL(spec.path,base);
  const headers={accept:"application/json"};
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
