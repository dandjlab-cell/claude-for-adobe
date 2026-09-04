// Minimal MCP "streamable HTTP" server (JSON-RPC over POST), hosted inside the panel's Node
// context so tool calls can reach evalScript directly. Claude Code is pointed at it via --mcp-config.
const crypto = require("node:crypto");
const http = require("node:http");

function createMcpServer({ name = "premiere", version = "0.1.0", tools, onCall, onLog = () => {} }) {
  // Capability token: only the Claude process the panel spawned knows it. Browsers send Origin; we refuse them.
  const token = crypto.randomBytes(24).toString("hex");
  function handle(message) {
    const { id, method, params = {} } = message;
    const reply = (result) => ({ jsonrpc: "2.0", id, result });
    const fail = (code, text) => ({ jsonrpc: "2.0", id, error: { code, message: text } });
    if (method === "initialize") {
      return reply({
        protocolVersion: params.protocolVersion || "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name, version },
      });
    }
    if (method === "ping") return reply({});
    if (method === "tools/list") return reply({ tools });
    if (method === "tools/call") {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return fail(-32602, "Unknown tool " + params.name);
      return Promise.resolve()
        .then(() => onCall(params.name, params.arguments || {}))
        .then((out) => reply({ content: out.content || [{ type: "text", text: String(out.text) }], isError: !!out.isError }))
        .catch((error) => reply({ content: [{ type: "text", text: "CLAUDE_FOR_ADOBE_ERROR:" + error.message }], isError: true }));
    }
    return fail(-32601, "Method not found: " + method);
  }

  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/mcp") { res.writeHead(404); res.end(); return; }
    if (req.headers.origin !== undefined || req.headers.authorization !== "Bearer " + token || !/^application\/json/.test(String(req.headers["content-type"] || ""))) { res.writeHead(403); res.end(); return; }
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 4 * 1024 * 1024) { req.destroy(); } });
    req.on("end", async () => {
      let message;
      try { message = JSON.parse(body); } catch (_) { res.writeHead(400); res.end(); return; }
      onLog("mcp <- " + message.method);
      if (message.id === undefined || message.id === null) { res.writeHead(202); res.end(); return; }
      const response = await handle(message);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ port, token, url: "http://127.0.0.1:" + port + "/mcp", close: () => server.close() });
    });
  });
}

module.exports = { createMcpServer };
