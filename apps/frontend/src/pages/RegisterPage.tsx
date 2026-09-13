import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setLoading(true);
    
    try {
      await register(email, username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">Create Account</h1>
        
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            label="Username"
            required
            autoComplete="username"
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_]+"
          />
          
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            label="Email"
            required
            autoComplete="email"
          />
          
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            label="Password"
            required
            autoComplete="new-password"
            minLength={8}
          />
          
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            label="Confirm Password"
            required
            autoComplete="new-password"
          />
          
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-gray-400">
          Already have an account?{' '}
          <a href="/login" className="link">Sign In</a>
        </p>
      </div>
    </div>
  );
}
