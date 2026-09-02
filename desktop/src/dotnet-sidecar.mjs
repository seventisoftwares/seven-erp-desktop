import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_OUTPUT = 16 * 1024 * 1024;
const MAX_STDERR = 16 * 1024;

function runtimeId() {
  if (process.platform === "win32") return "win-x64";
  if (process.platform === "darwin") return process.arch === "arm64" ? "osx-arm64" : "osx-x64";
  return process.arch === "arm64" ? "linux-arm64" : "linux-x64";
}

function executableName() { return process.platform === "win32" ? "Seven.AutoERP.Fiscal.Host.exe" : "Seven.AutoERP.Fiscal.Host"; }

export function createDotnetSidecar({ appDir, resourcesPath, isPackaged = false }) {
  const rid = runtimeId();

  function resolveCommand() {
    const roots = isPackaged
      ? [path.join(resourcesPath, "sidecar", rid)]
      : [path.join(appDir, "..", "sidecar", rid), path.join(appDir, "..", "..", "sidecar", rid)];
    for (const root of roots) {
      const executable = path.join(root, executableName());
      if (existsSync(executable)) return { command: executable, args: [], cwd: root, rid };
      const dll = path.join(root, "Seven.AutoERP.Fiscal.Host.dll");
      if (existsSync(dll)) return { command: "dotnet", args: [dll], cwd: root, rid };
    }
    return { command: null, args: [], cwd: roots[0], rid };
  }

  async function invoke(command, payload = {}, { timeoutMs = 120000 } = {}) {
    const target = resolveCommand();
    if (!target.command) {
      const error = new Error(`Sidecar .NET não instalado para ${target.rid}. Compile/publice Seven.AutoERP.Fiscal.Host antes de usar esta função.`);
      error.code = "DOTNET_SIDECAR_NOT_INSTALLED";
      throw error;
    }
    const id = randomUUID();
    const request = JSON.stringify({ id, command: String(command || "").trim(), payload });
    return new Promise((resolve, reject) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      const child = spawn(target.command, target.args, {
        cwd: target.cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, DOTNET_EnableDiagnostics: "0" },
      });
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { child.stdin.end(); } catch {}
        try { if (!child.killed) child.kill(); } catch {}
        if (error) reject(error); else resolve(result);
      };
      const timer = setTimeout(() => {
        const error = new Error(`Tempo limite excedido no sidecar .NET (${String(command)}).`);
        error.code = "DOTNET_SIDECAR_TIMEOUT";
        finish(error);
      }, Math.max(1000, Number(timeoutMs) || 120000));

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout, "utf8") > MAX_OUTPUT) return finish(Object.assign(new Error("Resposta do sidecar excedeu o limite permitido."), { code: "DOTNET_SIDECAR_OUTPUT_LIMIT" }));
        const newline = stdout.indexOf("\n");
        if (newline < 0) return;
        const line = stdout.slice(0, newline).trim();
        if (!line) return;
        try {
          const response = JSON.parse(line);
          if (response.id !== id) return finish(Object.assign(new Error("Resposta do sidecar não corresponde à requisição."), { code: "DOTNET_SIDECAR_PROTOCOL" }));
          if (!response.ok) return finish(Object.assign(new Error(response.error?.message || "Falha no sidecar .NET."), { code: response.error?.code || "DOTNET_SIDECAR_ERROR" }));
          finish(null, response.result);
        } catch (error) {
          finish(Object.assign(new Error(`Resposta inválida do sidecar .NET. ${error instanceof Error ? error.message : ""}`.trim()), { code: "DOTNET_SIDECAR_PROTOCOL" }));
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-MAX_STDERR); });
      child.on("error", (error) => finish(Object.assign(new Error(`Não foi possível iniciar o sidecar .NET. ${error.message}`), { code: "DOTNET_SIDECAR_START_FAILED" })));
      child.on("exit", (code) => {
        if (settled) return;
        const safeDetails = stderr.replace(/(passphrase|password|senha|csc|token|secret)\s*[:=]\s*\S+/gi, "$1=***").trim().slice(0, 1000);
        finish(Object.assign(new Error(`Sidecar .NET encerrou antes de responder (código ${code ?? "?"}).${safeDetails ? ` ${safeDetails}` : ""}`), { code: "DOTNET_SIDECAR_EXIT" }));
      });
      child.stdin.end(`${request}\n`, "utf8");
    });
  }

  async function status() {
    try { return { installed: true, rid, ...(await invoke("status", {}, { timeoutMs: 15000 })) }; }
    catch (error) { return { installed: false, rid, error: error instanceof Error ? error.message : "Sidecar indisponível." }; }
  }

  return { invoke, status, runtimeId: rid, resolveCommand };
}
