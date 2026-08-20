import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.naydoe.mtgoptimizer",
  appName: "MTG Optimizer",
  // The native shell loads from the live Railway URL — no static export required
  webDir: "www",
  server: {
    url: "https://naydoemtgoptimizer-test.up.railway.app",
    cleartext: false,
    allowNavigation: ["*.scryfall.io", "*.scryfall.com"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchFadeOutDuration: 500,
      backgroundColor: "#030712",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      spinnerColor: "#eab308",
      iosSpinnerStyle: "small",
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#030712",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
