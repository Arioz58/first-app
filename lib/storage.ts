import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const USER_ID_KEY = 'userId';

export const saveTokens = async (accessToken: string, refreshToken: string, userId: string) => {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  await SecureStore.setItemAsync(USER_ID_KEY, userId);
};

export const getAccessToken = () => SecureStore.getItemAsync(ACCESS_KEY);
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);
export const getUserId = () => SecureStore.getItemAsync(USER_ID_KEY);

export const clearTokens = async () => {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_ID_KEY);
};
