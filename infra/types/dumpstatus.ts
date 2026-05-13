export interface DumpFile {
  size: number;
  url: string;
  md5: string;
  sha1: string;
}

export interface DumpJob {
  status: string;
  updated: string;
  files?: Record<string, DumpFile>;
}

export interface DumpStatus {
  jobs: Record<string, DumpJob>;
  version: string;
}
