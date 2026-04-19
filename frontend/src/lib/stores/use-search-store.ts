import { create } from "zustand";
import type { SearchQueryType, SearchResult } from "@/lib/types";

interface SearchState {
  searchMode: SearchQueryType;
  results: SearchResult[];
  selectedTrackId: string | null;
  isSearching: boolean;
  setSearchMode: (mode: SearchQueryType) => void;
  setResults: (results: SearchResult[]) => void;
  selectTrack: (trackId: string | null) => void;
  setIsSearching: (isSearching: boolean) => void;
  clearResults: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  searchMode: "attributes",
  results: [],
  selectedTrackId: null,
  isSearching: false,
  setSearchMode: (searchMode) => set({ searchMode }),
  setResults: (results) => set({ results }),
  selectTrack: (selectedTrackId) => set({ selectedTrackId }),
  setIsSearching: (isSearching) => set({ isSearching }),
  clearResults: () => set({ results: [], selectedTrackId: null }),
}));
