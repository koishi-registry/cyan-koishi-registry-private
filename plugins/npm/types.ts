export type Range = [number, number];

export interface ReplicateInfo {
  db_name: string;
  engine: string;
  doc_count: number;
  doc_del_count: number;
  update_seq: number;
}

export interface Change {
  rev: string;
}

export interface ChangeRecord {
  seq: number;
  id: string;
  changes: Change[];
  deleted?: boolean;
}

export interface Block {
  chunk: Range;
  end: number;
}

export type BlockTask = Block & { done: boolean };
