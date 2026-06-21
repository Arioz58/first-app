import { useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';

export type SearchUser = { id: string; name: string; photoUrl: string | null };

// Recherche d'utilisateurs avec debounce (300ms) + garde anti-race (dernière requête seule retenue).
export function useUserSearch(query: string) {
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      try {
        const data = await apiRequest<SearchUser[]>(
          `/users/search?q=${encodeURIComponent(q)}`,
        );
        if (id === reqId.current) setResults(data);
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [query]);

  return { results, loading };
}
