import * as SecureStore from "expo-secure-store";

const URL_KEY = "kotys_base_url";
const TOKEN_KEY = "kotys_token";

export async function loadConfig() {
  const [baseUrl, token] = await Promise.all([
    SecureStore.getItemAsync(URL_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  return baseUrl && token ? { baseUrl, token } : null;
}

export async function saveConfig(baseUrl: string, token: string) {
  await SecureStore.setItemAsync(URL_KEY, baseUrl);
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearConfig() {
  await Promise.all([
    SecureStore.deleteItemAsync(URL_KEY),
    SecureStore.deleteItemAsync(TOKEN_KEY),
  ]);
}
