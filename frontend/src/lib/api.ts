import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const REQUEST_TIMEOUT = 10000; // 10 seconds standard protection limit

export const api: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for credential injection
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);


// // Response interceptor for intelligent network failure handling
// api.interceptors.response.use(
//   (response) => response,
//   async (error) => {
//     const originalRequest = error.config;

//     // Handle 401 Unauthorized (Expired Tokens) and protect against infinite loop
//     if (error.response?.status === 401 && !originalRequest._retry) {
//       originalRequest._retry = true;
      
//       try {
//         // Example logic for token refresh token exchange
//         const newAccessToken = await refreshAuthToken();
//         localStorage.setItem('token', newAccessToken);
//         originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
//         return api(originalRequest); 
//       } catch (refreshError) {
//         // If refresh fails, clear cache and force user expulsion to login view
//         if (typeof window !== 'undefined') {
//           localStorage.removeItem('token');
//           window.location.href = '/login';
//         }
//       }
//     }
//     return Promise.reject(error);
//   }
// );