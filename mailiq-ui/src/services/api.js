import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const authAPI = {
  getGoogleAuthUrl: () => api.get('/auth/google/url'),
  googleCallback: (code) => api.post('/auth/google/callback', { code }),
  verifyToken: () => api.get('/auth/verify'),
};

export const emailAPI = {
  syncEmails: () => api.post('/emails/sync'),
  getEmails: (page = 1, limit = 50) => api.get(`/emails?page=${page}&limit=${limit}`),
  getEmail: (id) => api.get(`/emails/${id}`),
  getDomainStats: () => api.get('/emails/stats/domains'),
  getFromsForDomain: (domain) => api.get(`/emails/stats/domains/${encodeURIComponent(domain)}/froms`),
  getEmailsByFrom: (fromEmail) => api.get(`/emails/from/${encodeURIComponent(fromEmail)}`),
  deleteEmailsByFrom: (fromEmail) => api.delete(`/emails/from/${encodeURIComponent(fromEmail)}`),
};

export default api;

