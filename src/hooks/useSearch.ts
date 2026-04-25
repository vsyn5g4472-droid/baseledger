import { useState, useCallback } from 'react';
import { User, ScoutSearchFilters } from '../models/types';
import { searchUsers, getPlayersByFilters } from '../services/userService';

const DEFAULT_FILTERS: ScoutSearchFilters = {};

export function usePlayerSearch(): {
  results: User[];
  loading: boolean;
  search: (query: string) => Promise<void>;
  filterByPosition: (position: string) => void;
  filters: ScoutSearchFilters;
  setFilters: (filters: ScoutSearchFilters) => void;
  applyFilters: () => Promise<void>;
  aiRecommendations: User[];
  loadingRecommendations: boolean;
} {
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ScoutSearchFilters>(DEFAULT_FILTERS);
  const [aiRecommendations] = useState<User[]>([]);
  const [loadingRecommendations] = useState(false);

  const search = useCallback(async (queryText: string) => {
    if (!queryText.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const users = await searchUsers(queryText);
      setResults(users);
    } catch (error) {
      if (__DEV__) console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const filterByPosition = useCallback((position: string) => {
    setFilters((prev) => ({ ...prev, position }));
  }, []);

  const applyFilters = useCallback(async () => {
    setLoading(true);
    try {
      const users = await getPlayersByFilters(filters);
      setResults(users);
    } catch (error) {
      if (__DEV__) console.error('Filter search failed:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  return {
    results,
    loading,
    search,
    filterByPosition,
    filters,
    setFilters,
    applyFilters,
    aiRecommendations,
    loadingRecommendations,
  };
}
