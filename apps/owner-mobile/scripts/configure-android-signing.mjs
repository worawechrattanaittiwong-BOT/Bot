import fs from "node:fs";

const path = "android/app/build.gradle";
let source = fs.readFileSync(path, "utf8");

if (!source.includes("signingConfigs")) {
  throw new Error("Android build.gradle has no signingConfigs block");
}
if (!source.includes("signingConfig signingConfigs.debug")) {
  throw new Error("Android release build is not using the expected Expo debug signing template");
}

const releaseSigning = `
        release {
            def signingPath = System.getenv("SCENOVA_OWNER_KEYSTORE_PATH")
            def signingStorePassword = System.getenv("SCENOVA_OWNER_STORE_PASSWORD")
            def signingKeyAlias = System.getenv("SCENOVA_OWNER_KEY_ALIAS")
            def signingKeyPassword = System.getenv("SCENOVA_OWNER_KEY_PASSWORD")
            if (!signingPath || !signingStorePassword || !signingKeyAlias || !signingKeyPassword) {
                throw new GradleException("SCENOVA Owner release signing environment is incomplete")
            }
            storeFile file(signingPath)
            storePassword signingStorePassword
            keyAlias signingKeyAlias
            keyPassword signingKeyPassword
        }
`;

source = source.replace(
  /signingConfigs\s*\{\s*debug\s*\{/,
  match => match.replace(/debug\s*\{/, releaseSigning + "        debug {")
);

const releaseBlock = /release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/;
if (!releaseBlock.test(source)) {
  throw new Error("Could not locate release signingConfig in Android build.gradle");
}
source = source.replace(
  releaseBlock,
  match => match.replace("signingConfig signingConfigs.debug", "signingConfig signingConfigs.release")
);

fs.writeFileSync(path, source);
console.log("SCENOVA Owner release signing configured.");
