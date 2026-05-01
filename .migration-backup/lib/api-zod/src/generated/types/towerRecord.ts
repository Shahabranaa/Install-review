export interface TowerRecord {
  id: number;
  stringId: number;
  name: string;
  lat?: number | null;
  lng?: number | null;
  progressStatus: string;
  locationType: string;
  connectedTo?: string | null;
  countOnString?: number | null;
  createdAt: string;
  updatedAt: string;
}
