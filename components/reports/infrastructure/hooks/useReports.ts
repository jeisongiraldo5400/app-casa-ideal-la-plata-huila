import { useReportsStore } from '../store/reportsStore';

export function useReports() {
  const store = useReportsStore();
  return store;
}

