import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    setError('');
    try {
      await register(email, username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Unable to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="kuro-auth">
      <div className="kuro-auth-art"><div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 40% 20%, rgba(155,108,255,.2), transparent 20rem), linear-gradient(160deg,#0b0c12,#1b1426)' }} /></div>
      <div className="kuro-auth-content">
        <div className="kuro-form">
          <Link to="/" className="kuro-brand">KURO</Link>
          <div className="kuro-eyebrow" style={{ marginTop: 48 }}>ACCOUNT</div>
          <h1>Create your profile</h1>
          <p>Keep taste, playback, and momentum in one private place.</p>
          {error ? <div className="kuro-page-note" style={{ marginTop: 18, color: '#ffadb0' }}>{error}</div> : null}
          <form className="kuro-form-stack" onSubmit={submit}>
            <label className="kuro-field"><span>Username</span><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} maxLength={30} required /></label>
            <label className="kuro-field"><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
            <label className="kuro-field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
            <label className="kuro-field"><span>Confirm password</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></label>
            <button className="kuro-button kuro-button-primary" type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create an account'} <ArrowRight size={15} /></button>
          </form>
          <p style={{ marginTop: 20 }}>Already have an account? <Link to="/login" className="kuro-text-link">Sign in</Link></p>
        </div>
      </div>
    </main>
  );
}
