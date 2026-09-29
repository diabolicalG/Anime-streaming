import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export default function HomePage() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data } = await api.get('/api/health');
      return data;
    },
  });

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Anime Streaming Platform</h1>
        
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">System Status</h2>
          {data ? (
            <p className={data?.data?.status === 'ok' ? 'text-green-400' : 'text-red-400'}>
              {data?.data?.status === 'ok' ? 'All systems operational' : 'Degraded'}
            </p>
          ) : (
            <p className="text-muted">Checking…</p>
          )}
        </div>
      </div>
    </div>
  );
}