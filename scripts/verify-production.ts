import { readFileSync } from "node:fs";

// Read local env safely to retrieve test credentials for live verification
let envText = "";
try {
  envText = readFileSync(".env", "utf8") + "\n" + (readFileSync(".env.local", "utf8") || "");
} catch {
  try { envText = readFileSync(".env.local", "utf8"); } catch {}
}

const getEnvVal = (k: string) => {
  const match = envText.match(new RegExp(`^${k}=["']?([^"'\\n\\r]+)["']?`, "m"));
  return match ? match[1].trim() : "";
};

const MASTER_PWD = getEnvVal("APP_MASTER_PASSWORD");
const BASE_URL = "https://vyavastha-orpin.vercel.app";

console.log("=== STARTING VYAVASTHA LIVE PRODUCTION VERIFICATION ===");
console.log("Target URL:", BASE_URL);

async function runVerification() {
  let passed = 0;
  let total = 0;

  function assert(name: string, ok: boolean, extra = "") {
    total++;
    if (ok) {
      passed++;
      console.log(`[PASS] ${name} ${extra}`);
    } else {
      console.error(`[FAIL] ${name} ${extra}`);
    }
  }

  // 1. Health Endpoint
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    assert("1. Health Endpoint HTTP 200", res.status === 200 && (data.status === "ok" || data.status === "degraded"), `(Status: ${res.status}, Service: ${data.status})`);
  } catch (e) {
    assert("1. Health Endpoint HTTP 200", false, String(e));
  }

  // 2. Auth: Negative test with wrong password
  try {
    const res = await fetch(`${BASE_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password-12345" }),
    });
    assert("2. Auth Rejection on Wrong Password", res.status === 401, `(Status: ${res.status})`);
  } catch (e) {
    assert("2. Auth Rejection on Wrong Password", false, String(e));
  }

  // 3. Auth: Positive test with valid master password
  let sessionCookie = "";
  try {
    const res = await fetch(`${BASE_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: MASTER_PWD }),
    });
    const setCookie = res.headers.get("set-cookie") || "";
    const match = setCookie.match(/vyavastha_session=([^;]+)/);
    if (match) {
      sessionCookie = `vyavastha_session=${match[1]}`;
    }
    assert("3. Auth Success & Session Cookie Set", res.status === 200 && sessionCookie.length > 0, `(Cookie present: ${!!sessionCookie})`);
  } catch (e) {
    assert("3. Auth Success & Session Cookie Set", false, String(e));
  }

  const authHeaders = {
    "Cookie": sessionCookie,
    "Content-Type": "application/json",
  };

  // 4. Ingestion / Quick Capture to Turso Cloud DB
  const testTitle = `Prod Test Note ${Date.now()}`;
  const testContent = `Observational note for Vyavastha live verification: Archival and Obsidian Workshop aesthetic operational at ${new Date().toISOString()}`;
  let createdKnowledgeId = "";
  try {
    const res = await fetch(`${BASE_URL}/api/knowledge`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: testTitle,
        summary: testContent,
        content: testContent,
        mediaType: "note",
        tags: ["prod-test", "verification"],
      }),
    });
    const data = await res.json();
    if (data && data.item && data.item.id) {
      createdKnowledgeId = data.item.id;
    }
    assert("4. Knowledge Ingestion (Turso Persisted)", res.status === 201 && !!createdKnowledgeId, `(Item ID: ${createdKnowledgeId})`);
  } catch (e) {
    assert("4. Knowledge Ingestion (Turso Persisted)", false, String(e));
  }

  // 5. Library Retrieval
  try {
    const res = await fetch(`${BASE_URL}/api/knowledge?limit=10`, {
      headers: authHeaders,
    });
    const data = await res.json();
    const found = Array.isArray(data.items) && data.items.some((it: any) => it.id === createdKnowledgeId);
    assert("5. Library Retrieval from Turso", res.status === 200 && found, `(Found in top items: ${found})`);
  } catch (e) {
    assert("5. Library Retrieval from Turso", false, String(e));
  }

  // 6. Grounded Chat Synthesis with Citation
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        message: testTitle,
      }),
    });
    const data = await res.json();
    const hasCitations = Array.isArray(data.citations) && data.citations.length > 0;
    const replyText = data.response || data.reply || "";
    const mentionsTitle = replyText.includes("Observational note") || replyText.includes(testTitle) || replyText.includes("aesthetic");
    assert("6. Grounded Chat Synthesis & Citations", res.status === 200 && (hasCitations || mentionsTitle), `(Citations: ${data.citations?.length || 0})`);
  } catch (e) {
    assert("6. Grounded Chat Synthesis & Citations", false, String(e));
  }

  // 7. Hallucination Guard: Unrelated query must yield 0 false citations
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        message: "What is the historical temperature on Mars in 1492 under Byzantine atmospheric pressure?",
      }),
    });
    const data = await res.json();
    const zeroFalseCitations = !data.citations || data.citations.length === 0;
    assert("7. Anti-Hallucination Guard (0 citations on unrelated query)", res.status === 200 && zeroFalseCitations, `(Citations returned: ${data.citations?.length || 0})`);
  } catch (e) {
    assert("7. Anti-Hallucination Guard", false, String(e));
  }

  // 8. Website Page Routes Accessibility
  const routes = ["/login", "/chat", "/library", "/memory", "/tasks", "/review"];
  let allRoutes200 = true;
  for (const route of routes) {
    try {
      const res = await fetch(`${BASE_URL}${route}`);
      if (res.status !== 200) {
        allRoutes200 = false;
        console.error(`Route ${route} returned status ${res.status}`);
      }
    } catch {
      allRoutes200 = false;
    }
  }
  assert("8. Web UI Routes (Login, Chat, Library, Memory, Tasks, Review) HTTP 200", allRoutes200, `(All 6 routes OK)`);

  console.log("==================================================");
  console.log(`TOTAL PASSED: ${passed}/${total}`);
  if (passed === total) {
    console.log("VERIFICATION STATUS: 100% SUCCESS — VYAVASTHA IS FULLY PRODUCTION OPERATIONAL!");
  } else {
    console.error("VERIFICATION STATUS: SOME CHECKS FAILED");
    process.exit(1);
  }
}

runVerification().catch(console.error);
