import { useEffect, useState } from 'react';
import { PeopleDashboard } from './components/people/PeopleDashboard';

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/people');
  useEffect(() => {
    if (!window.location.hash) window.location.hash = '#/people';
    const onChange = () => setHash(window.location.hash || '#/people');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();

  if (hash.startsWith('#/people')) {
    return <PeopleDashboard />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-8">
      <div className="text-center space-y-4">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20 text-white font-bold text-2xl">
          L
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Leados</h1>
        <p className="text-slate-400">The People Intelligence Engine is ready.</p>
        <a
          href="#/people"
          className="inline-block mt-2 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold transition-colors"
        >
          Open People Dashboard →
        </a>
      </div>
    </div>
  );
}
