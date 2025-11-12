import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import EmailList from './components/EmailList';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/emails" element={<EmailList />} />
      </Routes>
    </Router>
  );
}

export default App;
