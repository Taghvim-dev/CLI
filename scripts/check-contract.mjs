import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const c=JSON.parse(readFileSync(new URL("../contracts/operation-index.json",import.meta.url),"utf8"));
assert.equal(c.schemaVersion,1);
assert.match(c.contractVersion,/^\d+\.\d+\.\d+$/);
assert.match(c.openApiGitBlobSHA,/^[a-f0-9]{40}$/);
const entries=new Set(c.operations.map(x=>x.method+" "+x.path));
for(const entry of ["GET /v1/health","GET /v1/versions","POST /v1/dates/convert","POST /v1/business-days/add","GET /v1/holidays","POST /v1/schedules/preview","GET /v1/usage"]){assert.ok(entries.has(entry),"Missing "+entry)}
assert.ok(c.operations.every(o=>!(o.auth||[]).includes("OperatorToken")));
console.log("CLI contract checked: "+c.contractVersion+" / "+c.openApiGitBlobSHA);
