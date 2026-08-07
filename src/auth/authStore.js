/**
 * authStore.js
 * Wrapper penyimpanan token GitHub. WAJIB pakai expo-secure-store
 * (Keychain iOS / Keystore Android terenkripsi) - lihat dokumen konsep
 * Bagian 6.1. Token TIDAK PERNAH ditulis lewat AsyncStorage plaintext,
 * dan TIDAK PERNAH masuk ke logger.js manapun.
 */

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'gh_access_token';
const USER_KEY = 'gh_user_profile';

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function saveUserProfile(profile) {
  // Profil publik (login, name, email noreply, avatar) - bukan rahasia,
  // tapi tetap disimpan di SecureStore biar konsisten 1 tempat dengan token.
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(profile));
}

export async function getUserProfile() {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function isLoggedIn() {
  const token = await getToken();
  return !!token;
}
