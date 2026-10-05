import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="kuro-auth">
      <div className="kuro-auth-art"><div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 40%, rgba(155,108,255,.28), transparent 22rem), linear-gradient(135deg,#15111f,#07080c)' }} /></div>
      <div className="kuro-auth-content">
        <div className="kuro-form">
          <Link to="/" className="kuro-brand">KURO</Link>
          <div className="kuro-eyebrow" style={{ marginTop: 48 }}>KURO</div>
          <h1>Welcome back</h1>
          <p>Sign in to continue watching, keep your history inspectable, and pick up exactly where you left off.</p>
          {error ? <div className="kuro-page-note" style={{ marginTop: 18, color: '#ffadb0' }}>{error}</div> : null}
          <form className="kuro-form-stack" onSubmit={submit}>
            <label className="kuro-field"><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
            <label className="kuro-field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
            <button className="kuro-button kuro-button-primary" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'} <ArrowRight size={15} /></button>
          </form>
          <p style={{ marginTop: 20 }}>New to Kuro? <Link to="/register" className="kuro-text-link">Create an account</Link></p>
        </div>
      </div>
    </main>
  );
}
