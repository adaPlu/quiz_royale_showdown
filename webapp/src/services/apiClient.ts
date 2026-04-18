import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false
});

apiClient.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem("qrs.accessToken");
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status !== 401) {
      throw error;
    }

    const refreshToken = localStorage.getItem("qrs.refreshToken");
    if (!refreshToken) {
      throw error;
    }

    const refreshResponse = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken
    });
    localStorage.setItem("qrs.accessToken", refreshResponse.data.tokens.accessToken);
    localStorage.setItem("qrs.refreshToken", refreshResponse.data.tokens.refreshToken);
    error.config.headers.Authorization = `Bearer ${refreshResponse.data.tokens.accessToken}`;
    return apiClient.request(error.config);
  }
);
