import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { emailAPI, authAPI } from '../services/api';

function EmailList() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    loadEmails();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/');
        return;
      }

      const response = await authAPI.verifyToken();
      setUser(response.data.user);
    } catch (err) {
      console.error('Auth check failed:', err);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/');
    }
  };

  const loadEmails = async () => {
    try {
      setLoading(true);
      const response = await emailAPI.getEmails();
      setEmails(response.data.emails);
      setError('');
    } catch (err) {
      console.error('Error loading emails:', err);
      setError('Failed to load emails');
    } finally {
      setLoading(false);
    }
  };

  const syncEmails = async () => {
    try {
      setSyncing(true);
      setError('');
      await emailAPI.syncEmails();
      await loadEmails();
    } catch (err) {
      console.error('Error syncing emails:', err);
      setError('Failed to sync emails');
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px',
        padding: '10px',
        borderBottom: '1px solid #ddd'
      }}>
        <div>
          <h1 style={{ margin: 0 }}>MailIQ</h1>
          {user && <p style={{ margin: '5px 0', color: '#666' }}>{user.email}</p>}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={syncEmails}
            disabled={syncing}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: syncing ? 'not-allowed' : 'pointer',
              opacity: syncing ? 0.6 : 1
            }}
          >
            {syncing ? 'Syncing...' : 'Sync Emails'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Error Message */}
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

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Loading emails...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && emails.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <h2>No emails found</h2>
          <p>Click "Sync Emails" to fetch your emails from Gmail</p>
        </div>
      )}

      {/* Email List */}
      {!loading && emails.length > 0 && (
        <div>
          <p style={{ marginBottom: '10px', color: '#666' }}>
            Total emails: {emails.length}
          </p>
          <div style={{ border: '1px solid #ddd', borderRadius: '4px' }}>
            {emails.map((email, index) => (
              <div
                key={email._id}
                style={{
                  padding: '15px',
                  borderBottom: index < emails.length - 1 ? '1px solid #eee' : 'none',
                  backgroundColor: email.isRead ? 'white' : '#f5f5f5',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = email.isRead ? 'white' : '#f5f5f5'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontWeight: email.isRead ? 'normal' : 'bold' }}>
                      {email.from}
                    </strong>
                  </div>
                  <div style={{ color: '#666', fontSize: '14px', marginLeft: '10px' }}>
                    {formatDate(email.date)}
                  </div>
                </div>
                <div style={{ marginBottom: '5px' }}>
                  <span style={{ fontWeight: email.isRead ? 'normal' : 'bold' }}>
                    {email.subject}
                  </span>
                </div>
                <div style={{ color: '#666', fontSize: '14px' }}>
                  {email.snippet}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailList;

