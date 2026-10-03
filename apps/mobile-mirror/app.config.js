const appleTeamId = process.env.SCENOVA_IOS_TEAM_ID || "APPLE_TEAM_ID_NOT_SET";

module.exports = {
  expo: {
    name: "SCENOVA Mirror",
    slug: "scenova-mirror",
    version: "1.0.1",
    orientation: "default",
    scheme: "scenova-mirror",
    userInterfaceStyle: "dark",
    android: {
      package: "com.scenova.mirror",
      versionCode: 2,
      allowBackup: false
    },
    ios: {
      bundleIdentifier: "com.scenova.mirror",
      buildNumber: "2",
      supportsTablet: false
    },
    plugins: [
      [
        "@apirtc/expo-apirtc-options-plugin",
        {
          enableMediaProjectionService: true,
          enableVideoEffects: false,
          appleTeamId
        }
      ]
    ]
  }
};
