function createJsonLineParser(onMessage, onMalformed) {
  let buffer = "";

  function parse(line) {
    if (!line.trim()) return;
    try {
      onMessage(JSON.parse(line));
    } catch (error) {
      onMalformed(line, error);
    }
  }

  return {
    push(chunk) {
      buffer += String(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach(parse);
    },
    finish() {
      if (buffer) parse(buffer);
      buffer = "";
    },
  };
}

function createRpcPeer(writeLine) {
  let nextId = 1;
  const pending = new Map();
  const peer = {
    onRequest() {},
    onNotification() {},
    request(method, params) {
      const id = nextId++;
      writeLine(JSON.stringify({ id, method, params }) + "\n");
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    notify(method, params) {
      const message = { method };
      if (params !== undefined) message.params = params;
      writeLine(JSON.stringify(message) + "\n");
    },
    receive(message) {
      if (Object.prototype.hasOwnProperty.call(message, "id") &&
          (Object.prototype.hasOwnProperty.call(message, "result") ||
           Object.prototype.hasOwnProperty.call(message, "error"))) {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message || "App Server error"));
        else entry.resolve(message.result);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(message, "id") && message.method) {
        peer.onRequest(message);
        return;
      }
      if (message.method) peer.onNotification(message);
    },
    respond(id, result) {
      writeLine(JSON.stringify({ id, result }) + "\n");
    },
    respondError(id, code, message) {
      writeLine(JSON.stringify({ id, error: { code, message } }) + "\n");
    },
    rejectPending(error) {
      pending.forEach(({ reject }) => reject(error));
      pending.clear();
    },
  };
  return peer;
}

const rejectionPatterns = [
  // Receiver-agnostic: aliases like `var p = app.project; p.save()` are caught too.
  ["Application lifecycle operations are not allowed.", /\.\s*(?:quit|openDocument|newProject|closeDocument)\b/],
  ["Project persistence operations are not allowed.", /\.\s*(?:save|saveAs)\b/],
  ["Render and export operations are not allowed.", /\bencoder\b|\brenderQueue\b|\.\s*(?:encode\w*|export\w*)\b/],
  ["Dynamic evaluation is not allowed.", /\b(?:eval|Function|constructor|callee|caller|toSource|evalFile|with|call|apply|bind)\b/],
  ["Filesystem, network, shell, and engine objects are not allowed.", /\b(?:File|Folder|Socket|BridgeTalk|ExternalObject|system|callSystem|XML|reflect|Reflection|Window|ScriptUI|Palette|Dialog|\$)\b|(?:^|[^\w$])\$(?![\w$])/],
  ["`this` and escape sequences are not allowed.", /\bthis\b|\\[ux0-7]/],
  ["Preprocessor directives are not allowed.", /^\s*#\s*(?:include|includepath|target|script|strict)\b/m],
  ["Asynchronous execution is not allowed.", /\.\s*scheduleTask\s*\(/],
];

const warningPatterns = [
  ["QE DOM use is undocumented and may be unsafe.", /\bapp\s*\.\s*enableQE\b|\bqe\s*\./i],
];

// A script is "read-only" only if it proves it: no string literals or comments at all (see inspectExtendScript),
// no assignments to properties, no delete, every method call on the allowlist, and only numeric computed indexes. Anything else needs the
// user's click before it runs (panel.js), on top of the duplicate sequence and checkpoints.
const READ_ONLY_CALL = /^(?:(?:get|is|has|query|find|to|index|char|search)[A-Za-z]*|slice|split|join|match|replace|substr|substring|concat|push|pop|shift|unshift|sort|reverse|String|Number|Boolean|Array|parseInt|parseFloat|isNaN|isFinite|floor|ceil|round|abs|min|max|pow|sqrt|exec|test|log|localeCompare)$/;
function isReadOnlyScript(src) {
  // Any assignment or increment at all, of any operator (=, +=, |=, <<=, ++ ...), except `var name = ...`
  // declarations, means "not a plain read". Comparisons are removed first so == != <= >= do not count.
  const noCompare = src.replace(/[=!<>]==?=?/g, " ").replace(/\bvar\s+[A-Za-z_$][\w$]*\s*=/g, " ");
  if (/=|\+\+|--/.test(noCompare)) return false;
  if (/(?:\.|\])\s*[A-Za-z_$][\w$]*\s*(?:[+\-*\/%&|^]?=|<<=|>>>?=|\+\+|--)(?!=)/.test(src)) return false;
  if (/\bdelete\b/.test(src)) return false;
  if (/\[\s*(?![0-9]+\s*\]|["'])[^\]]*\]/.test(src.replace(/\[\s*\]/g, ""))) return false;
  const calls = [...src.matchAll(/\.\s*([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  if (!calls.every((name) => READ_ONLY_CALL.test(name))) return false;
  // A bare call (`f()`, `new X()`) can be a saved reference to anything, so only known globals pass.
  const bare = [...src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]).filter((n) => !/^(?:if|for|while|switch|catch|function|return|typeof|new|in)$/.test(n));
  return bare.every((n) => /^(?:String|Number|Boolean|Array|parseInt|parseFloat|isNaN|isFinite)$/.test(n));
}

const mutationPatterns = [
  /\.\s*(?:add|attach|change|clear|create|delete|execute|import|insert|move|overwrite|remove|rename|set)\w*\s*\(/i,
  /(?:\.|\])\s*[A-Za-z_$][\w$]*\s*(?:[+\-*\/%&|^]?=|<<=|>>>?=|\+\+|--)(?!=)/,
  /(?:\+\+|--)\s*(?:[A-Za-z_$][\w$]*\s*\.|[^;\n]*\])\s*[A-Za-z_$][\w$]*/,
  /\]\s*(?:[+\-*\/%&|^]?=|<<=|>>>?=|\+\+|--)(?!=)/,
  /(?:\+\+|--)\s*[^;\n]*\]/,
  /\bdelete\b/,
];

// Calls that bypass Premiere's History: Cmd+Z cannot undo them, so the panel takes a file checkpoint first.
// ponytail: fixed list from the ExtendScript API; extend when a new call is seen to skip History.
const nonUndoablePatterns = [
  ["changeMediaPath (relink)", /\.changeMediaPath\s*\(/],
  ["refreshMedia", /\.refreshMedia\s*\(/],
  ["setOverrideFrameRate", /\.setOverrideFrameRate\s*\(/],
  ["attachProxy", /\.attachProxy\s*\(/],
  ["setScratchDiskPath", /\.setScratchDiskPath\s*\(/],
  ["setXMPMetadata", /\.setXMPMetadata\s*\(/],
  ["setProjectPanelMetadata", /\.setProjectPanelMetadata\s*\(/],
  ["sequence.setSettings", /\.setSettings\s*\(/],
  ["deleteSequence", /\.deleteSequence\s*\(/],
  ["setOffline", /\.setOffline\s*\(/],
  ["importFiles / importSequences", /\.import(Files|Sequences|AEComps?)\s*\(/],
];

const hasComments = (src) => /\/\*[\s\S]*?\*\/|\/\/[^\n]*/.test(src);
const hasStrings = (src) => /["']/.test(src);

function inspectExtendScript(code) {
  // Comments are stripped before matching so `a./*x*/save/*y*/()` cannot split a token.
  let inspectedSource = String(code).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  let previousSource;
  do {
    previousSource = inspectedSource;
    // Fold any string concatenation, including empty pieces: "sa"+""+"ve" -> "save".
    inspectedSource = inspectedSource.replace(
      /(["'])([^"'\\]*)\1\s*\+\s*(["'])([^"'\\]*)\3/g,
      (_match, _leftQuote, left, _rightQuote, right) => JSON.stringify(left + right),
    );
  } while (inspectedSource !== previousSource);
  inspectedSource = inspectedSource.replace(
    /\[\s*(["'])([A-Za-z_$][\w$]*)\1\s*\]/g,
    ".$2",
  );
  const rejected = rejectionPatterns.find(([, pattern]) => pattern.test(inspectedSource));
  const mutating = mutationPatterns.some((pattern) => pattern.test(inspectedSource)) || nonUndoablePatterns.some(([, p]) => p.test(inspectedSource));
  return {
    rejection: rejected ? rejected[0] : null,
    warnings: warningPatterns
      .filter(([, pattern]) => pattern.test(inspectedSource))
      .map(([warning]) => warning),
    mutating,
    notUndoable: nonUndoablePatterns.filter(([, p]) => p.test(inspectedSource)).map(([name]) => name),
    // Auto-run without a click only for the plainest reads: no strings, comments, or escapes at all.
    readOnly: !rejected && !mutating && !hasComments(String(code)) && !hasStrings(String(code)) && !/\\/.test(String(code)) && isReadOnlyScript(inspectedSource),
  };
}

function buildExtendScriptWrapper(code) {
  const inspection = inspectExtendScript(code);
  if (inspection.rejection) throw new Error(inspection.rejection);
  const source = JSON.stringify(String(code))
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return "(function () {" +
    "var File=null,Folder=null,Socket=null,BridgeTalk=null,system=null,$=null;" +
    "var source=" + source + ",result;" +
    "function text(value){var s=value===undefined?'':String(value);" +
      "if(s.length>65536){s=s.substring(0,65500)+'\\n...[truncated]';}return s;}" +
    "function evaluate(value){return eval(value);}" +
    "try{new Function(source);}" +
    "catch(error){return 'CLAUDE_FOR_ADOBE_ERROR:'+text(error);}" +
    "try{result=evaluate.call({},source);return 'CLAUDE_FOR_ADOBE_OK:'+text(result);}" +
    "catch(error){return 'CLAUDE_FOR_ADOBE_ERROR:'+text(error);}" +
  "}())";
}

module.exports = { isReadOnlyScript,
  buildExtendScriptWrapper,
  createJsonLineParser,
  createRpcPeer,
  inspectExtendScript,
};
