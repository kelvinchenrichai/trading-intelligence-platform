import { SupabaseStore } from "../db/supabaseStore";
import { CmeNqImportResult, StoredCmeImport } from "./types";

export interface PersistCmeImportOptions {
  force?: boolean;
}

export class CmeImportService {
  constructor(private readonly store: SupabaseStore | null) {}

  get configured(): boolean { return Boolean(this.store); }

  async persist(result: CmeNqImportResult, options: PersistCmeImportOptions = {}): Promise<StoredCmeImport> {
    if (!this.store) throw new Error("Supabase is not configured. CME imports require durable storage.");
    return this.store.persistCmeImport(result, options);
  }

  async list(): Promise<StoredCmeImport[]> {
    if (!this.store) return [];
    return this.store.listCmeImports();
  }
}
