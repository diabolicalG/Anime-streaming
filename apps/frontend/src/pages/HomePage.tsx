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
          <div className="grid gap-4 md:grid-cols-3">
            <StatusCard 
              title="Database" 
              status={data?.checks?.database} 
            />
            <StatusCard 
              title="Redis" 
              status={data?.checks?.redis} 
            />
            <StatusCard 
              title="Providers" 
              status={data?.checks?.providers} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, status }: { title: string; status: boolean | Record<string, boolean> }) {
  const isHealthy = typeof status === 'boolean' ? status : Object.values(status).some(v => v);
  
  return (
    <div className={`p-4 rounded-lg ${isHealthy ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'} border`}>
      <h3 className="font-medium">{title}</h3>
      <p className={isHealthy ? 'text-green-400' : 'text-red-400'}>
        {isHealthy ? 'Healthy' : 'Degraded'}
      </p>
    </div>
  );
}
