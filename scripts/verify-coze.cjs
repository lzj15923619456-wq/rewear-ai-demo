// This probe never sends an image or reaches a paid model node.
const assert = require('node:assert/strict');
const path = require('node:path');
try { process.loadEnvFile(path.join(__dirname,'../.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

async function main() {
  const tested = new Set();
  for (const kind of ['ANALYZE','STYLIST']) {
    const base = process.env[`COZE_${kind}_BASE_URL`];
    const token = process.env[`COZE_${kind}_TOKEN`];
    assert.ok(base && token, `${kind}: 请先完成本机私密配置`);
    const url = new URL('/run',base);
    assert.equal(url.protocol,'https:','工作流必须使用 HTTPS');
    // The same workflow may provide both capabilities.
    const signature = url.href+'\n'+token;
    if (tested.has(signature)) continue;
    tested.add(signature);
    const probe = async credential => fetch(url,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{'Content-Type':'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})},
      body:JSON.stringify({payload:{schemaVersion:1,requestId:'rewear-deployment-probe',action:'unknown'}})
    });
    for (const credential of [null,'invalid-test-token']) {
      const response = await probe(credential);
      assert.ok([401,403].includes(response.status), `${kind}: 未授权调用返回 ${response.status}，请先修复部署鉴权`);
      await response.body?.cancel();
    }
    const response = await probe(token);
    assert.equal(response.status,200,`${kind}: 授权调用失败，HTTP ${response.status}`);
    const result = await response.json();
    const output = result.result || result.output || result;
    assert.equal(output.status,'error','工作流错误响应协议不一致');
    assert.ok(output.warnings?.includes('invalid_action'),'工作流未返回预期验证结果');
    console.log(`${kind}: 鉴权和 payload/result 协议验证通过（未调用模型）`);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
