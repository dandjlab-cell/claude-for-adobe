// Live probe: real Claude Code CLI, fake Premiere. Asserts the MCP tool round-trip end to end.
const assert = require("node:assert/strict");
const { createMcpServer } = require("../src/mcp-http.cjs");
const { createClaudeSession } = require("../src/claude-session.cjs");

(async () => {
  let called = null;
  const mcp = await createMcpServer({
    tools: [{ name: "run_extendscript", description: "Run ExtendScript in Premiere.", inputSchema: { type: "object", properties: { summary: { type: "string" }, code: { type: "string" } }, required: ["summary", "code"] } }],
    onCall: (_n, args) => { called = args; return { text: "CLAUDE_FOR_ADOBE_OK:Active sequence: Probe Sequence" }; },
  });
  const texts = [];
  const session = createClaudeSession({
    mcpUrl: mcp.url, model: "claude-haiku-4-5",
    onEvent: (e) => {
      if (e.kind === "text") texts.push(e.text);
      if (e.kind === "turn_done") {
        session.stop(); mcp.close();
        assert.ok(called && called.code, "tool was called with code");
        assert.ok(texts.join(" ").includes("Probe Sequence"), "answer used the tool result: " + texts.join(" | "));
        console.log("probe ok | tool code:", called.code.slice(0, 80).replace(/\n/g, " "), "| answer:", texts.join(" ").slice(0, 80));
      }
    },
  });
  session.send("What is the active sequence called? Use the tool.");
})();
