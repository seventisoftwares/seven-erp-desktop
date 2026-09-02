import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const repoDir = path.resolve(desktopDir, "..");
const project = path.join(repoDir, "dotnet", "Seven.AutoERP.Fiscal.Host", "Seven.AutoERP.Fiscal.Host.csproj");
const sidecarRoot = path.join(desktopDir, "sidecar");
const requested = process.argv.slice(2).filter(Boolean);
const defaults = process.platform === "win32" ? ["win-x64"] : process.platform === "darwin" ? ["osx-x64", "osx-arm64"] : [process.arch === "arm64" ? "linux-arm64" : "linux-x64"];
const rids = requested.length ? requested : defaults;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoDir, stdio: "inherit", shell: false, env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

mkdirSync(sidecarRoot, { recursive: true });
for (const rid of rids) {
  const output = path.join(sidecarRoot, rid);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  console.log(`\n[Seven ERP] Publicando sidecar .NET ${rid}...`);
  run("dotnet", ["publish", project, "-c", "Release", "-r", rid, "--self-contained", "true", "-p:PublishSingleFile=true", "-p:IncludeNativeLibrariesForSelfExtract=true", "-p:DebugType=None", "-p:DebugSymbols=false", "-o", output]);
}
console.log(`\n[Seven ERP] Sidecar publicado em ${sidecarRoot}`);
