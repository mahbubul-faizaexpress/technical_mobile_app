import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import type { LinkingOptions } from "@react-navigation/native";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator } from "@/navigation/app-navigator";
import { AuthProvider } from "@/providers/auth-provider";
import { AppConfigProvider } from "@/providers/app-config-provider";
import type { RootStackParamList } from "@/navigation/types";
import { ThemeProvider, useAppTheme } from "@/theme/theme-provider";

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL("/")],
  config: {
    screens: {
      Login: "",
      MainTabs: {
        screens: {
          Overview: "MainTabs/Overview",
          Orders: "MainTabs/Orders",
          Status: "MainTabs/Status",
          Companies: "MainTabs/Companies",
          Activity: "MainTabs/Activity",
          Settings: "MainTabs/Settings",
        },
      },
      AddOrder: "AddOrder",
      CompanyDetail: {
        path: "CompanyDetail",
        parse: {
          companyId: (value) => Number(value),
        },
      },
      Refund: "Refund",
    },
  },
};

function RootNavigation() {
  const { navigationTheme, isDark } = useAppTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NavigationContainer linking={linking} theme={navigationTheme}>
        <AppConfigProvider>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </AppConfigProvider>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigation />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
