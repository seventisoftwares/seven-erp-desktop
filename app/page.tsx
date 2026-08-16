import SevenErpApp from "./seven-erp-app";
import { headers } from "next/headers";
import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "";
  if (host && !host.startsWith("terminal.local") && !host.startsWith("localhost")) {
    await requireChatGPTUser("/");
  }
  return <SevenErpApp />;
}
