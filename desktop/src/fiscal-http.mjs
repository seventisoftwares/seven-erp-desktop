import https from "node:https";

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value === undefined || value === null) continue;
    normalized[String(key).toLowerCase()] = String(value);
  }
  return normalized;
}

export function parseResponseBody(rawBody, contentType = "") {
  const body = String(rawBody || "");
  if (!body) return null;
  if (String(contentType).toLowerCase().includes("json")) {
    try { return JSON.parse(body); } catch { return body; }
  }
  return body;
}

export function requestMtls({
  url,
  method = "GET",
  headers = {},
  body = null,
  pfx,
  passphrase = "",
  timeoutMs = 20000,
}) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(url); }
    catch { reject(new Error("URL fiscal inválida.")); return; }

    if (target.protocol !== "https:") {
      reject(new Error("Integrações fiscais externas exigem HTTPS."));
      return;
    }
    if (!Buffer.isBuffer(pfx) || pfx.length === 0) {
      reject(new Error("Certificado A1 não foi carregado para a conexão mTLS."));
      return;
    }

    const requestHeaders = normalizeHeaders(headers);
    if (body !== null && body !== undefined && !requestHeaders["content-length"]) {
      requestHeaders["content-length"] = Buffer.byteLength(body);
    }

    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method,
      headers: requestHeaders,
      pfx,
      passphrase,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      servername: target.hostname,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const responseHeaders = {};
        for (const [key, value] of Object.entries(response.headers)) {
          responseHeaders[key] = Array.isArray(value) ? value.join(", ") : value ?? "";
        }
        resolve({
          status: response.statusCode || 0,
          statusMessage: response.statusMessage || "",
          headers: responseHeaders,
          rawBody,
          data: parseResponseBody(rawBody, response.headers["content-type"] || ""),
        });
      });
    });

    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Tempo limite de ${timeoutMs} ms excedido ao acessar o autorizador.`)));
    request.on("error", reject);
    if (body !== null && body !== undefined) request.write(body);
    request.end();
  });
}
