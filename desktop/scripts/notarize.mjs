import { notarize } from "@electron/notarize";

export default async function notarizeMac(context) {
  if (context.electronPlatformName !== "darwin") return;
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) return;
  const appName = context.packager.appInfo.productFilename;
  await notarize({
    appBundleId: "br.com.seventitecnologia.erp",
    appPath: `${context.appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
}
