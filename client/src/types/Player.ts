export type Player = {
  id: string;
  name: string;
  points: number;
  group: string | null;
  isGameMaster: boolean;
  color: string | null;
};
