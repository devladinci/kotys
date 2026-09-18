import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { probeHealth } from "@kotys/client";
import { theme, useThemeMode } from "../lib/theme";

/**
 * First-run pairing: the daemon URL plus the bearer token it printed on
 * start. Both go into the Keychain the moment they are accepted.
 *
 * "Connect" probes /health first — an unreachable URL otherwise pairs
 * "successfully" and the user only meets the failure as a broken screen
 * afterwards, with no way to know whether URL or token was wrong.
 */
export function PairingScreen({
  onPaired,
}: {
  onPaired: (baseUrl: string, token: string) => void;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const connect = useCallback(async () => {
    const url = baseUrl.trim().replace(/\/+$/, "");
    if (!url || !token.trim()) {
      setError("Both URL and token are required.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      if (!(await probeHealth(url))) {
        throw new Error(`unreachable`);
      }
      onPaired(url, token.trim());
    } catch {
      setError(
        `Can't reach ${url}. Check the URL, that the Mac daemon is running with a reachable bind (KOTYS_HOST), and that the phone is on the same Tailnet or Wi-Fi.`,
      );
    } finally {
      setChecking(false);
    }
  }, [baseUrl, token, onPaired]);

  return (
    <View style={[s.form, { backgroundColor: t.bg }]}>
      <Text style={[s.heading, { color: t.text }]}>Pair with your Mac</Text>
      <Text style={[s.hint, { color: t.textMuted }]}>
        Base URL of the daemon — e.g. http://100.x.y.z:3017 over Tailscale
        (works from any network), or http://192.168.x.x:3017 on your home Wi-Fi
        only. 127.0.0.1 never works from a phone — that is the phone itself, not
        the Mac.
      </Text>

      <Text style={[s.label, { color: t.text }]}>Server URL</Text>
      <TextInput
        value={baseUrl}
        onChangeText={setBaseUrl}
        placeholder="http://100.64.0.1:3017"
        placeholderTextColor={t.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={[
          s.input,
          { backgroundColor: t.surface, color: t.text, borderColor: t.border },
        ]}
      />

      <Text style={[s.label, { color: t.text }]}>API token</Text>
      <TextInput
        value={token}
        onChangeText={setToken}
        placeholder="printed when the daemon starts"
        placeholderTextColor={t.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={[
          s.input,
          { backgroundColor: t.surface, color: t.text, borderColor: t.border },
        ]}
      />

      {error ? (
        <Text
          selectable
          style={{ color: t.danger, fontSize: 13, lineHeight: 18 }}
        >
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={checking}
        onPress={() => void connect()}
        style={[
          s.button,
          { backgroundColor: t.accent, opacity: checking ? 0.6 : 1 },
        ]}
      >
        {checking ? (
          <ActivityIndicator color={t.accentInk} />
        ) : (
          <Text style={[s.buttonText, { color: t.accentInk }]}>Connect</Text>
        )}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  form: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  heading: { fontSize: 22, fontWeight: "600" },
  hint: { fontSize: 13, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { fontSize: 15, fontWeight: "600" },
});
