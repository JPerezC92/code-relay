import { createHash } from 'node:crypto';
import type { OpencodeClient } from '@opencode-ai/sdk';
import type { OpenCodeSdkResult, OpenCodeSessionApi } from './allowlist';

type ProjectApi = OpencodeClient['project'];

export type ProjectListOptions = Parameters<ProjectApi['list']>[0];

export interface OpenCodeProjectApi {
  list(options?: ProjectListOptions): Promise<OpenCodeSdkResult>;
}

export interface OpenCodeCatalogClientLike {
  project: OpenCodeProjectApi;
  session: OpenCodeSessionApi;
}

export interface SessionCatalogSummary {
  id: string;
  title: string;
  updatedAt: number;
  projectKey: string;
  projectLabel: string;
}

export interface SessionCatalogProject {
  key: string;
  label: string;
}

export interface SessionCatalogResult {
  projects: SessionCatalogProject[];
  sessions: SessionCatalogSummary[];
}

export class SessionCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionCatalogError';
  }
}

interface ProjectRecord {
  id: string;
  worktree: string;
}

interface RootSessionRecord {
  id: string;
  title: string;
  updatedAt: number;
  directory: string;
  projectId: string;
}

interface ProjectBucket {
  label: string;
  newestUpdatedAt: number | null;
  records: RootSessionRecord[];
}

const GLOBAL_PROJECT_ID = 'global';

const KEY_FIELD_SEPARATOR = '\u0000';

const FALLBACK_PROJECT_LABEL = 'project';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === 'string' ? value : undefined;
}

function readFiniteNumber(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeProjectRecord(raw: unknown): ProjectRecord | null {
  if (!isRecord(raw)) return null;
  const id = readString(raw, 'id');
  const worktree = readString(raw, 'worktree');
  if (id === undefined || worktree === undefined) return null;
  return { id, worktree };
}

function normalizeRootSessionRecord(raw: unknown): RootSessionRecord | null {
  if (!isRecord(raw)) return null;
  if (raw.parentID !== undefined) return null;
  const id = readString(raw, 'id');
  const projectId = readString(raw, 'projectID');
  const directory = readString(raw, 'directory');
  if (id === undefined || projectId === undefined || directory === undefined) return null;
  const time = raw.time;
  if (!isRecord(time)) return null;
  const updatedAt = readFiniteNumber(time, 'updated');
  if (updatedAt === undefined) return null;
  return { id, title: readString(raw, 'title') ?? '', updatedAt, directory, projectId };
}

function unwrapSdkData(result: OpenCodeSdkResult, context: string): unknown | SessionCatalogError {
  if (result.error !== undefined) return new SessionCatalogError(`${context} failed`);
  if (!('data' in result)) {
    return new SessionCatalogError(`${context} returned no data`);
  }
  return result.data;
}

function buildProjectKey(projectId: string, directory: string | null): string {
  const digest = createHash('sha256');
  digest.update(projectId);
  if (directory !== null) {
    digest.update(KEY_FIELD_SEPARATOR);
    digest.update(directory);
  }
  return digest.digest('hex');
}

function projectLabelOf(path: string): string {
  const segments = path
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  const sanitized = (segments.at(-1) ?? '').replace(/[\\/]/g, '').trim();
  return sanitized.length > 0 ? sanitized : FALLBACK_PROJECT_LABEL;
}

export class SessionCatalog {
  private readonly client: OpenCodeCatalogClientLike;
  private readonly routes = new Map<string, string>();

  constructor(client: OpenCodeCatalogClientLike) {
    this.client = client;
  }

  lookup(sessionId: string): string | null {
    return this.routes.get(sessionId) ?? null;
  }

  count(): number {
    return this.routes.size;
  }

  clear(): void {
    this.routes.clear();
  }

  async list(): Promise<SessionCatalogResult | SessionCatalogError> {
    try {
      const projectResult = await this.client.project.list();
      const projectData = unwrapSdkData(projectResult, 'OpenCode project list');
      if (projectData instanceof SessionCatalogError) return projectData;
      if (!Array.isArray(projectData)) {
        return new SessionCatalogError('OpenCode project list data was not an array');
      }
      const projects: ProjectRecord[] = [];
      const worktreeByProjectId = new Map<string, string>();
      const buckets = new Map<string, ProjectBucket>();
      for (const raw of projectData) {
        const project = normalizeProjectRecord(raw);
        if (project === null) continue;
        projects.push(project);
        worktreeByProjectId.set(project.id, project.worktree);
        const key = buildProjectKey(project.id, null);
        if (!buckets.has(key)) {
          buckets.set(key, {
            label: projectLabelOf(project.worktree),
            newestUpdatedAt: null,
            records: [],
          });
        }
      }

      const seenSessionIds = new Set<string>();
      for (const project of projects) {
        const sessionResult = await this.client.session.list({
          query: { directory: project.worktree },
        });
        const sessionData = unwrapSdkData(sessionResult, 'OpenCode session list');
        if (sessionData instanceof SessionCatalogError) return sessionData;
        if (!Array.isArray(sessionData)) {
          return new SessionCatalogError('OpenCode session list data was not an array');
        }
        for (const raw of sessionData) {
          const record = normalizeRootSessionRecord(raw);
          if (record === null) continue;
          if (seenSessionIds.has(record.id)) continue;
          seenSessionIds.add(record.id);
          const global = record.projectId === GLOBAL_PROJECT_ID;
          const key = buildProjectKey(record.projectId, global ? record.directory : null);
          const labelSource = global
            ? record.directory
            : worktreeByProjectId.get(record.projectId) ?? record.directory;
          const label = projectLabelOf(labelSource);
          const bucket = buckets.get(key);
          if (bucket === undefined) {
            buckets.set(key, { label, newestUpdatedAt: record.updatedAt, records: [record] });
          } else {
            if (bucket.newestUpdatedAt === null || record.updatedAt > bucket.newestUpdatedAt) {
              bucket.newestUpdatedAt = record.updatedAt;
            }
            bucket.records.push(record);
          }
        }
      }

      const orderedBuckets = [...buckets.entries()].sort(([leftKey, left], [rightKey, right]) => {
        if (left.newestUpdatedAt === null && right.newestUpdatedAt !== null) return 1;
        if (left.newestUpdatedAt !== null && right.newestUpdatedAt === null) return -1;
        if (
          left.newestUpdatedAt !== null &&
          right.newestUpdatedAt !== null &&
          right.newestUpdatedAt !== left.newestUpdatedAt
        ) {
          return right.newestUpdatedAt - left.newestUpdatedAt;
        }
        if (leftKey < rightKey) return -1;
        if (leftKey > rightKey) return 1;
        return 0;
      });

      const summaries: SessionCatalogSummary[] = [];
      const catalogProjects: SessionCatalogProject[] = [];
      const routes = new Map<string, string>();
      for (const [key, bucket] of orderedBuckets) {
        catalogProjects.push({ key, label: bucket.label });
        bucket.records.sort((left, right) => {
          if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
          if (left.id < right.id) return -1;
          if (left.id > right.id) return 1;
          return 0;
        });
        for (const record of bucket.records) {
          summaries.push({
            id: record.id,
            title: record.title,
            updatedAt: record.updatedAt,
            projectKey: key,
            projectLabel: bucket.label,
          });
          routes.set(record.id, record.directory);
        }
      }
      this.routes.clear();
      for (const [sessionId, directory] of routes) {
        this.routes.set(sessionId, directory);
      }
      return { projects: catalogProjects, sessions: summaries };
    } catch {
      return new SessionCatalogError('OpenCode catalog request failed');
    }
  }
}
