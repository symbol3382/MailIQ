import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/emails');
    }

    // Handle OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      handleGoogleCallback(code);
    }
  }, []);

  const handleGoogleCallback = async (code) => {
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.googleCallback(code);
      
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      // Clear URL parameters
      window.history.replaceState({}, document.title, '/');
      
      navigate('/emails');
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to login. Please try again.');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.getGoogleAuthUrl();
      window.location.href = response.data.url;
    } catch (err) {
      console.error('Error getting Google URL:', err);
      setError('Failed to initiate login. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <h1>MailIQ</h1>
        <p>Manage your emails in a better way</p>
        
        {error && (
          <div style={{ 
            padding: '10px', 
            marginBottom: '20px', 
            backgroundColor: '#ffebee', 
            color: '#c62828',
            borderRadius: '4px'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            marginTop: '20px'
          }}
        >
          {loading ? 'Loading...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}

export default Login;

