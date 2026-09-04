const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createMcpServer } = require("../src/mcp-http.cjs");

function post(url, body, token, extra = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...extra } }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("initialize, tools/list, tools/call, notifications", async () => {
  const calls = [];
  const mcp = await createMcpServer({
    tools: [{ name: "run_extendscript", description: "d", inputSchema: { type: "object" } }],
    onCall: (name, args) => { calls.push([name, args]); return { text: "CLAUDE_FOR_ADOBE_OK:hi" }; },
  });
  try {
    const init = await post(mcp.url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }, mcp.token);
    assert.equal(init.body.result.protocolVersion, "2025-11-25");
    assert.equal((await post(mcp.url, { jsonrpc: "2.0", method: "notifications/initialized" }, mcp.token)).status, 202);
    const list = await post(mcp.url, { jsonrpc: "2.0", id: 2, method: "tools/list" }, mcp.token);
    assert.deepEqual(list.body.result.tools.map((t) => t.name), ["run_extendscript"]);
    const call = await post(mcp.url, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "run_extendscript", arguments: { code: "1" } } }, mcp.token);
    assert.deepEqual(call.body.result, { content: [{ type: "text", text: "CLAUDE_FOR_ADOBE_OK:hi" }], isError: false });
    assert.deepEqual(calls, [["run_extendscript", { code: "1" }]]);
    const unknown = await post(mcp.url, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }, mcp.token);
    assert.equal(unknown.body.error.code, -32602);
  } finally {
    mcp.close();
  }
});

test("tool errors become isError results, not crashes", async () => {
  const mcp = await createMcpServer({ tools: [{ name: "t", inputSchema: {} }], onCall: () => { throw new Error("boom"); } });
  try {
    const call = await post(mcp.url, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "t" } }, mcp.token);
    assert.equal(call.body.result.isError, true);
    assert.match(call.body.result.content[0].text, /boom/);
  } finally {
    mcp.close();
  }
});

test("requests without the session token, or with a browser Origin, are refused", async () => {
  const mcp = await createMcpServer({ tools: [{ name: "t", inputSchema: {} }], onCall: () => ({ text: "x" }) });
  try {
    assert.equal((await post(mcp.url, { jsonrpc: "2.0", id: 1, method: "ping" })).status, 403);
    assert.equal((await post(mcp.url, { jsonrpc: "2.0", id: 1, method: "ping" }, "wrong")).status, 403);
    assert.equal((await post(mcp.url, { jsonrpc: "2.0", id: 1, method: "ping" }, mcp.token, { origin: "http://evil.test" })).status, 403);
    assert.equal((await post(mcp.url.replace("/mcp", "/other"), { jsonrpc: "2.0", id: 1, method: "ping" }, mcp.token)).status, 404);
    assert.equal((await post(mcp.url, { jsonrpc: "2.0", id: 1, method: "ping" }, mcp.token)).status, 200);
  } finally { mcp.close(); }
});
