import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAppConfig } from "@/providers/app-config-provider";
import { useAuth } from "@/providers/auth-provider";

const BACKGROUND_GRADIENT = ["#04101d", "#0a1c31", "#11314d"] as const;
const BUTTON_GRADIENT = ["#1ccfbe", "#16b9c4"] as const;

export function LoginScreen() {
  const { config } = useAppConfig();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(true);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(18)).current;
  const pulseOne = useRef(new Animated.Value(0)).current;
  const pulseTwo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        duration: 520,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        duration: 520,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseOne, {
            duration: 5600,
            easing: Easing.inOut(Easing.sin),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOne, {
            duration: 5600,
            easing: Easing.inOut(Easing.sin),
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseTwo, {
            duration: 6400,
            easing: Easing.inOut(Easing.sin),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(pulseTwo, {
            duration: 6400,
            easing: Easing.inOut(Easing.sin),
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();
  }, [fadeIn, pulseOne, pulseTwo, slideUp]);

  const handleLogin = async () => {
    if (!config.graphqlApiUrl.trim()) {
      const message = "GraphQL API URL is missing in the shared environment.";
      setSubmitError(message);
      Alert.alert("Missing GraphQL API", message);
      return;
    }

    try {
      setSubmitError(null);
      setSubmitting(true);
      await login(email, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sign in.";
      setSubmitError(message);
      Alert.alert("Login failed", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={BACKGROUND_GRADIENT} style={styles.gradient}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          styles.glowPrimary,
          {
            opacity: pulseOne.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.32] }),
            transform: [
              {
                translateY: pulseOne.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -16],
                }),
              },
              {
                scale: pulseOne.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.07],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          styles.glowSecondary,
          {
            opacity: pulseTwo.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.26] }),
            transform: [
              {
                translateY: pulseTwo.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 18],
                }),
              },
              {
                scale: pulseTwo.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.05],
                }),
              },
            ],
          },
        ]}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <Animated.View
          style={[
            styles.panel,
            {
              opacity: fadeIn,
              transform: [{ translateY: slideUp }],
            },
          ]}
        >
          <Text style={styles.title}>Login</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputShell}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="Enter your email"
                placeholderTextColor="rgba(220, 234, 252, 0.42)"
                style={styles.input}
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordShell}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Enter your password"
                placeholderTextColor="rgba(220, 234, 252, 0.42)"
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                textContentType="password"
                value={password}
                onChangeText={setPassword}
              />
              <Pressable
                onPress={() => setShowPassword((current) => !current)}
                style={({ pressed }) => [styles.eyeButton, pressed ? styles.eyeButtonPressed : null]}
              >
                <Ionicons
                  color="rgba(220, 234, 252, 0.78)"
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={() => setRememberPassword((current) => !current)}
            style={({ pressed }) => [
              styles.rememberRow,
              pressed ? styles.rememberRowPressed : null,
            ]}
          >
            <View style={[styles.checkbox, rememberPassword && styles.checkboxActive]}>
              {rememberPassword ? <Ionicons color="#042321" name="checkmark" size={16} /> : null}
            </View>
            <Text style={styles.rememberLabel}>Save password</Text>
          </Pressable>

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

          <Pressable disabled={submitting} onPress={handleLogin} style={styles.buttonWrap}>
            <LinearGradient colors={BUTTON_GRADIENT} style={[styles.button, submitting && styles.buttonDisabled]}>
              {submitting ? (
                <ActivityIndicator color="#042321" />
              ) : (
                <Text style={styles.buttonLabel}>Login</Text>
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  glow: {
    borderRadius: 999,
    position: "absolute",
  },
  glowPrimary: {
    backgroundColor: "#19c4bb",
    height: 260,
    right: -48,
    top: 110,
    width: 260,
  },
  glowSecondary: {
    backgroundColor: "#0f766e",
    bottom: 100,
    height: 220,
    left: -56,
    width: 220,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  panel: {
    alignSelf: "center",
    backgroundColor: "rgba(6, 18, 33, 0.7)",
    borderColor: "rgba(176, 204, 255, 0.12)",
    borderRadius: 28,
    borderWidth: 1,
    gap: 16,
    maxWidth: 390,
    padding: 22,
    shadowColor: "#020817",
    shadowOffset: {
      width: 0,
      height: 18,
    },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    width: "100%",
  },
  title: {
    color: "#f8fbff",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  field: {
    gap: 8,
  },
  label: {
    color: "rgba(220, 234, 252, 0.72)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  inputShell: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(176, 204, 255, 0.12)",
    borderRadius: 18,
    borderWidth: 1,
  },
  input: {
    color: "#f8fbff",
    fontSize: 15,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  passwordShell: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(176, 204, 255, 0.12)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 4,
  },
  passwordInput: {
    color: "#f8fbff",
    flex: 1,
    fontSize: 15,
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  eyeButton: {
    alignItems: "center",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  eyeButtonPressed: {
    opacity: 0.76,
  },
  rememberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  rememberRowPressed: {
    opacity: 0.82,
  },
  checkbox: {
    alignItems: "center",
    borderColor: "rgba(176, 204, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkboxActive: {
    backgroundColor: "#19c4bb",
    borderColor: "#19c4bb",
  },
  rememberLabel: {
    color: "rgba(220, 234, 252, 0.86)",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: "#ff8f8f",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  buttonWrap: {
    borderRadius: 18,
    overflow: "hidden",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    opacity: 0.68,
  },
  buttonLabel: {
    color: "#042321",
    fontSize: 15,
    fontWeight: "900",
  },
});
