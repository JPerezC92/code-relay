import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SessionCatalog, SessionCatalogError } from './session-catalog';
import type {
  OpenCodeCatalogClientLike,
  SessionCatalogResult,
  SessionCatalogSummary,
} from './session-catalog';
import type { SessionListOptions } from './allowlist';

const ALPHA_WORKTREE = '/home/dev/alpha';
const BETA_WORKTREE = '/home/dev/beta';

interface FakeProjectInput {
  id: string;
  worktree: string;
}

interface FakeSessionInput {
  id: string;
  projectID: string;
  directory: string;
  updatedAt: number;
  title?: string;
  parentID?: string;
}

function toRawSession(session: FakeSessionInput): Record<string, unknown> {
  return {
    id: session.id,
    projectID: session.projectID,
    directory: session.directory,
    time: { updated: session.updatedAt },
    ...(session.title !== undefined ? { title: session.title } : {}),
    ...(session.parentID !== undefined ? { parentID: session.parentID } : {}),
  };
}

function rawSessions(...inputs: FakeSessionInput[]): unknown[] {
  return inputs.map(toRawSession);
}

function createCatalogHarness(
  projectData: unknown[],
  sessionsByDirectory: Record<string, unknown[]>,
) {
  const projectList = vi.fn(async () => ({
    data: projectData,
    error: undefined,
    request: {},
    response: {},
  }));
  const sessionList = vi.fn(async (options?: SessionListOptions) => {
    const directory = options?.query?.directory;
    const sessions = directory !== undefined ? (sessionsByDirectory[directory] ?? []) : [];
    return { data: sessions, error: undefined, request: {}, response: {} };
  });
  const status = vi.fn(async () => ({ data: {}, error: undefined, request: {}, response: {} }));
  const messages = vi.fn(async () => ({ data: [], error: undefined, request: {}, response: {} }));
  const promptAsync = vi.fn(async () => ({
    data: undefined,
    error: undefined,
    request: {},
    response: {},
  }));
  const abort = vi.fn(async () => ({ data: true, error: undefined, request: {}, response: {} }));
  const client: OpenCodeCatalogClientLike = {
    project: { list: projectList },
    session: { list: sessionList, status, messages, promptAsync, abort },
  };
  return { client, projectList, sessionList, catalog: new SessionCatalog(client) };
}

function expectSummaries(
  result: SessionCatalogResult | SessionCatalogError,
): SessionCatalogSummary[] {
  return expectCatalog(result).sessions;
}

function expectCatalog(
  result: SessionCatalogResult | SessionCatalogError,
): SessionCatalogResult {
  expect(result).not.toBeInstanceOf(SessionCatalogError);
  if (result instanceof SessionCatalogError) {
    throw new Error(`expected catalog result, received: ${result.message}`);
  }
  return result;
}

function opaqueProjectKey(projectId: string): string {
  return createHash('sha256').update(projectId).digest('hex');
}

describe('session-catalog', () => {
  it('lists only root sessions and excludes children including empty-string parentIDs', async () => {
    const harness = createCatalogHarness([{ id: 'proj-alpha', worktree: ALPHA_WORKTREE }], {
      [ALPHA_WORKTREE]: rawSessions(
        {
          id: 'ses-root-1',
          projectID: 'proj-alpha',
          directory: ALPHA_WORKTREE,
          updatedAt: 300,
          title: 'Root one',
        },
        {
          id: 'ses-child-1',
          projectID: 'proj-alpha',
          directory: ALPHA_WORKTREE,
          updatedAt: 900,
          title: 'Child',
          parentID: 'ses-root-1',
        },
        {
          id: 'ses-child-empty',
          projectID: 'proj-alpha',
          directory: ALPHA_WORKTREE,
          updatedAt: 800,
          parentID: '',
        },
        { id: 'ses-root-2', projectID: 'proj-alpha', directory: ALPHA_WORKTREE, updatedAt: 200 },
      ),
    });

    const summaries = expectSummaries(await harness.catalog.list());

    expect(summaries).toHaveLength(2);
    expect(summaries.map((summary) => summary.id)).toStrictEqual(['ses-root-1', 'ses-root-2']);
    expect(summaries[1]?.title).toBe('');
  });

  it('queries the session list once per project worktree', async () => {
    const harness = createCatalogHarness(
      [
        { id: 'proj-alpha', worktree: ALPHA_WORKTREE },
        { id: 'proj-beta', worktree: BETA_WORKTREE },
      ],
      {
        [ALPHA_WORKTREE]: rawSessions({
          id: 'ses-a1',
          projectID: 'proj-alpha',
          directory: ALPHA_WORKTREE,
          updatedAt: 100,
        }),
        [BETA_WORKTREE]: rawSessions({
          id: 'ses-b1',
          projectID: 'proj-beta',
          directory: BETA_WORKTREE,
          updatedAt: 200,
        }),
      },
    );

    expectSummaries(await harness.catalog.list());

    expect(harness.projectList).toHaveBeenCalledTimes(1);
    expect(harness.sessionList).toHaveBeenCalledTimes(2);
    expect(harness.sessionList).toHaveBeenNthCalledWith(1, {
      query: { directory: ALPHA_WORKTREE },
    });
    expect(harness.sessionList).toHaveBeenNthCalledWith(2, {
      query: { directory: BETA_WORKTREE },
    });
  });

  it('groups sessions per project, newest project first, and orders by updatedAt then id', async () => {
    const harness = createCatalogHarness(
      [
        { id: 'proj-alpha', worktree: ALPHA_WORKTREE },
        { id: 'proj-beta', worktree: BETA_WORKTREE },
      ],
      {
        [ALPHA_WORKTREE]: rawSessions(
          { id: 'ses-a1', projectID: 'proj-alpha', directory: ALPHA_WORKTREE, updatedAt: 300, title: 'Alpha one' },
          { id: 'ses-a0', projectID: 'proj-alpha', directory: ALPHA_WORKTREE, updatedAt: 300, title: 'Alpha zero' },
          { id: 'ses-a2', projectID: 'proj-alpha', directory: ALPHA_WORKTREE, updatedAt: 100 },
        ),
        [BETA_WORKTREE]: rawSessions({
          id: 'ses-b1',
          projectID: 'proj-beta',
          directory: BETA_WORKTREE,
          updatedAt: 500,
          title: 'Beta main',
        }),
      },
    );

    const catalog = expectCatalog(await harness.catalog.list());
    const { sessions: summaries } = catalog;

    expect(summaries.map((summary) => summary.id)).toStrictEqual([
      'ses-b1',
      'ses-a0',
      'ses-a1',
      'ses-a2',
    ]);
    expect(
      summaries.map((summary) => ({
        id: summary.id,
        title: summary.title,
        updatedAt: summary.updatedAt,
        projectLabel: summary.projectLabel,
      })),
    ).toStrictEqual([
      { id: 'ses-b1', title: 'Beta main', updatedAt: 500, projectLabel: 'beta' },
      { id: 'ses-a0', title: 'Alpha zero', updatedAt: 300, projectLabel: 'alpha' },
      { id: 'ses-a1', title: 'Alpha one', updatedAt: 300, projectLabel: 'alpha' },
      { id: 'ses-a2', title: '', updatedAt: 100, projectLabel: 'alpha' },
    ]);
    expect(catalog.projects).toStrictEqual([
      { key: opaqueProjectKey('proj-beta'), label: 'beta' },
      { key: opaqueProjectKey('proj-alpha'), label: 'alpha' },
    ]);
  });

  it('includes zero-root legacy projects as safe entries after projects with root sessions', async () => {
    const emptyWorktree = '/home/dev/empty';
    const harness = createCatalogHarness(
      [
        { id: 'proj-alpha', worktree: ALPHA_WORKTREE },
        { id: 'proj-beta', worktree: BETA_WORKTREE },
        { id: 'proj-empty', worktree: emptyWorktree },
      ],
      {
        [ALPHA_WORKTREE]: rawSessions({
          id: 'ses-alpha',
          projectID: 'proj-alpha',
          directory: ALPHA_WORKTREE,
          updatedAt: 100,
        }),
        [BETA_WORKTREE]: rawSessions({
          id: 'ses-beta',
          projectID: 'proj-beta',
          directory: BETA_WORKTREE,
          updatedAt: 200,
        }),
        [emptyWorktree]: [],
      },
    );

    const catalog = expectCatalog(await harness.catalog.list());

    expect(catalog.projects).toStrictEqual([
      { key: opaqueProjectKey('proj-beta'), label: 'beta' },
      { key: opaqueProjectKey('proj-alpha'), label: 'alpha' },
      { key: opaqueProjectKey('proj-empty'), label: 'empty' },
    ]);
    expect(catalog.sessions.map((summary) => summary.id)).toStrictEqual(['ses-beta', 'ses-alpha']);
    for (const project of catalog.projects) {
      expect(Object.keys(project).sort()).toStrictEqual(['key', 'label']);
    }

    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain('proj-alpha');
    expect(serialized).not.toContain('proj-beta');
    expect(serialized).not.toContain('proj-empty');
    expect(serialized).not.toContain(ALPHA_WORKTREE);
    expect(serialized).not.toContain(BETA_WORKTREE);
    expect(serialized).not.toContain(emptyWorktree);
    expect(serialized).not.toContain('projectID');
    expect(serialized).not.toContain('directory');
    expect(serialized).not.toContain('worktree');
    expect(serialized).not.toContain('parentID');
  });

  it('emits opaque project keys and never leaks host-only fields', async () => {
    const harness = createCatalogHarness(
      [
        { id: 'proj-alpha', worktree: ALPHA_WORKTREE },
        { id: 'proj-beta', worktree: BETA_WORKTREE },
      ],
      {
        [ALPHA_WORKTREE]: rawSessions(
          { id: 'ses-a1', projectID: 'proj-alpha', directory: ALPHA_WORKTREE, updatedAt: 300, title: 'Alpha one' },
          { id: 'ses-a2', projectID: 'proj-alpha', directory: ALPHA_WORKTREE, updatedAt: 100 },
          { id: 'ses-global-a', projectID: 'global', directory: ALPHA_WORKTREE, updatedAt: 200, title: 'Global work' },
        ),
        [BETA_WORKTREE]: rawSessions({
          id: 'ses-b1',
          projectID: 'proj-beta',
          directory: BETA_WORKTREE,
          updatedAt: 500,
          title: 'Beta main',
        }),
      },
    );

    const catalog = expectCatalog(await harness.catalog.list());
    const { sessions: summaries } = catalog;
    expect(summaries).toHaveLength(4);

    for (const summary of summaries) {
      expect(Object.keys(summary).sort()).toStrictEqual([
        'id',
        'projectKey',
        'projectLabel',
        'title',
        'updatedAt',
      ]);
      expect(summary.projectKey).toMatch(/^[0-9a-f]{64}$/);
    }

    const keys = summaries.map((summary) => summary.projectKey);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    expect(keys[3]).not.toBe(keys[1]);
    expect(keys[3]).not.toBe(keys[0]);

    for (const project of catalog.projects) {
      expect(Object.keys(project).sort()).toStrictEqual(['key', 'label']);
      expect(project.key).toMatch(/^[0-9a-f]{64}$/);
    }

    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain('proj-alpha');
    expect(serialized).not.toContain('proj-beta');
    expect(serialized).not.toContain(ALPHA_WORKTREE);
    expect(serialized).not.toContain(BETA_WORKTREE);
    expect(serialized).not.toContain('projectID');
    expect(serialized).not.toContain('directory');
    expect(serialized).not.toContain('worktree');
    expect(serialized).not.toContain('parentID');

    const refreshed = expectCatalog(await harness.catalog.list());
    expect(refreshed).toStrictEqual(catalog);
  });

  it('separates global-project sessions per directory', async () => {
    const harness = createCatalogHarness(
      [
        { id: 'proj-alpha', worktree: ALPHA_WORKTREE },
        { id: 'proj-beta', worktree: BETA_WORKTREE },
      ],
      {
        [ALPHA_WORKTREE]: rawSessions(
          { id: 'ses-global-alpha-1', projectID: 'global', directory: ALPHA_WORKTREE, updatedAt: 100, title: 'Alpha global one' },
          { id: 'ses-global-alpha-0', projectID: 'global', directory: ALPHA_WORKTREE, updatedAt: 50, title: 'Alpha global zero' },
        ),
        [BETA_WORKTREE]: rawSessions({
          id: 'ses-global-beta',
          projectID: 'global',
          directory: BETA_WORKTREE,
          updatedAt: 300,
          title: 'Beta global',
        }),
      },
    );

    const catalog = expectCatalog(await harness.catalog.list());
    const { sessions: summaries } = catalog;

    expect(summaries).toHaveLength(3);
    expect(summaries.map((summary) => summary.id)).toStrictEqual([
      'ses-global-beta',
      'ses-global-alpha-1',
      'ses-global-alpha-0',
    ]);
    expect(
      summaries.map((summary) => summary.projectLabel),
    ).toStrictEqual(['beta', 'alpha', 'alpha']);
    for (const summary of summaries) {
      expect(summary.projectKey).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(summaries[0]?.projectKey).not.toBe(summaries[1]?.projectKey);
    expect(summaries[1]?.projectKey).toBe(summaries[2]?.projectKey);

    // Global-directory buckets surface as explicit project entries (newest
    // first) ahead of the legacy zero-root project.list entries.
    expect(catalog.projects).toHaveLength(4);
    const [betaEntry, alphaEntry, ...zeroRootEntries] = catalog.projects;
    expect(betaEntry).toStrictEqual({ key: summaries[0]?.projectKey, label: 'beta' });
    expect(alphaEntry).toStrictEqual({ key: summaries[1]?.projectKey, label: 'alpha' });
    expect(zeroRootEntries).toHaveLength(2);

    // Legacy zero-root entries tie-break by opaque-key order, so compare them
    // as an exact key-normalized set.
    const byKey = (left: { key: string }, right: { key: string }) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
    expect([...zeroRootEntries].sort(byKey)).toStrictEqual(
      [
        { key: opaqueProjectKey('proj-alpha'), label: 'alpha' },
        { key: opaqueProjectKey('proj-beta'), label: 'beta' },
      ].sort(byKey),
    );

    for (const project of catalog.projects) {
      expect(Object.keys(project).sort()).toStrictEqual(['key', 'label']);
    }

    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain('proj-alpha');
    expect(serialized).not.toContain('proj-beta');
    expect(serialized).not.toContain(ALPHA_WORKTREE);
    expect(serialized).not.toContain(BETA_WORKTREE);
    expect(serialized).not.toContain('projectID');
    expect(serialized).not.toContain('directory');
    expect(serialized).not.toContain('worktree');
    expect(serialized).not.toContain('parentID');
  });

  it('derives sanitized basename labels with a project fallback', async () => {
    const harness = createCatalogHarness(
      [
        { id: 'proj-plain', worktree: ALPHA_WORKTREE },
        { id: 'proj-win', worktree: 'C:\\dev\\gamma' },
        { id: 'proj-trail', worktree: '/home/dev/delta/' },
        { id: 'proj-dots', worktree: '.' },
        { id: 'proj-root', worktree: '/' },
      ],
      {
        [ALPHA_WORKTREE]: rawSessions(
          { id: 'ses-plain', projectID: 'proj-plain', directory: ALPHA_WORKTREE, updatedAt: 900, title: 'Plain' },
          { id: 'ses-ghost', projectID: 'proj-ghost', directory: '/home/dev/ghost-land', updatedAt: 600, title: 'Ghost' },
        ),
        'C:\\dev\\gamma': rawSessions({
          id: 'ses-win',
          projectID: 'proj-win',
          directory: 'C:\\dev\\gamma',
          updatedAt: 800,
          title: 'Win',
        }),
        '/home/dev/delta/': rawSessions({
          id: 'ses-trail',
          projectID: 'proj-trail',
          directory: '/home/dev/delta/',
          updatedAt: 700,
          title: 'Trail',
        }),
        '.': rawSessions({ id: 'ses-dots', projectID: 'proj-dots', directory: '.', updatedAt: 500, title: 'Dots' }),
        '/': rawSessions({ id: 'ses-root', projectID: 'proj-root', directory: '/', updatedAt: 400, title: 'Root' }),
      },
    );

    const summaries = expectSummaries(await harness.catalog.list());

    expect(summaries.map((summary) => [summary.id, summary.projectLabel])).toStrictEqual([
      ['ses-plain', 'alpha'],
      ['ses-win', 'gamma'],
      ['ses-trail', 'delta'],
      ['ses-ghost', 'ghost-land'],
      ['ses-dots', 'project'],
      ['ses-root', 'project'],
    ]);
  });

  it('deduplicates session ids across project listings, keeping the first occurrence', async () => {
    const harness = createCatalogHarness(
      [
        { id: 'proj-alpha', worktree: ALPHA_WORKTREE },
        { id: 'proj-beta', worktree: BETA_WORKTREE },
      ],
      {
        [ALPHA_WORKTREE]: rawSessions({
          id: 'ses-dup',
          projectID: 'proj-alpha',
          directory: ALPHA_WORKTREE,
          updatedAt: 400,
          title: 'Dup alpha',
        }),
        [BETA_WORKTREE]: rawSessions({
          id: 'ses-dup',
          projectID: 'proj-beta',
          directory: BETA_WORKTREE,
          updatedAt: 400,
          title: 'Dup beta',
        }),
      },
    );

    const summaries = expectSummaries(await harness.catalog.list());

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.title).toBe('Dup alpha');
    expect(harness.catalog.lookup('ses-dup')).toBe(ALPHA_WORKTREE);
    expect(harness.catalog.count()).toBe(1);
  });

  it('skips malformed project and session entries without failing the refresh', async () => {
    const harness = createCatalogHarness(
      [
        'not-a-project',
        { id: 'proj-no-worktree' },
        { id: 'proj-alpha', worktree: ALPHA_WORKTREE },
      ],
      {
        [ALPHA_WORKTREE]: [
          ...rawSessions({
            id: 'ses-a1',
            projectID: 'proj-alpha',
            directory: ALPHA_WORKTREE,
            updatedAt: 100,
            title: 'Only valid',
          }),
          null,
          'garbage-session',
          { id: 'ses-no-directory', projectID: 'proj-alpha', time: { updated: 100 } },
          { id: 'ses-no-project', directory: ALPHA_WORKTREE, time: { updated: 100 } },
          { id: 'ses-no-time', projectID: 'proj-alpha', directory: ALPHA_WORKTREE },
        ],
      },
    );

    const summaries = expectSummaries(await harness.catalog.list());

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe('ses-a1');
    expect(harness.sessionList).toHaveBeenCalledTimes(1);
  });

  it('returns SessionCatalogError for SDK errors and missing or non-array data', async () => {
    const harness = createCatalogHarness([], {});

    harness.client.project.list = async () => ({
      data: undefined,
      error: { message: 'SDK failed' },
      request: {},
      response: {},
    });
    const projectError = await harness.catalog.list();
    expect(projectError).toBeInstanceOf(SessionCatalogError);
    if (projectError instanceof SessionCatalogError) {
      expect(projectError.message).toBe('OpenCode project list failed');
    }

    harness.client.project.list = async () => ({ error: undefined, request: {}, response: {} });
    const projectMissing = await harness.catalog.list();
    expect(projectMissing).toBeInstanceOf(SessionCatalogError);
    if (projectMissing instanceof SessionCatalogError) {
      expect(projectMissing.message).toBe('OpenCode project list returned no data');
    }

    harness.client.project.list = async () => ({
      data: { not: 'an array' },
      error: undefined,
      request: {},
      response: {},
    });
    const projectShape = await harness.catalog.list();
    expect(projectShape).toBeInstanceOf(SessionCatalogError);
    if (projectShape instanceof SessionCatalogError) {
      expect(projectShape.message).toBe('OpenCode project list data was not an array');
    }

    harness.client.project.list = async () => ({
      data: [{ id: 'proj-alpha', worktree: ALPHA_WORKTREE }],
      error: undefined,
      request: {},
      response: {},
    });
    harness.client.session.list = async () => ({
      data: undefined,
      error: { message: 'SDK failed' },
      request: {},
      response: {},
    });
    const sessionError = await harness.catalog.list();
    expect(sessionError).toBeInstanceOf(SessionCatalogError);
    if (sessionError instanceof SessionCatalogError) {
      expect(sessionError.message).toBe('OpenCode session list failed');
    }

    harness.client.session.list = async () => ({ error: undefined, request: {}, response: {} });
    const sessionMissing = await harness.catalog.list();
    expect(sessionMissing).toBeInstanceOf(SessionCatalogError);
    if (sessionMissing instanceof SessionCatalogError) {
      expect(sessionMissing.message).toBe('OpenCode session list returned no data');
    }

    harness.client.session.list = async () => ({
      data: { not: 'an array' },
      error: undefined,
      request: {},
      response: {},
    });
    const sessionShape = await harness.catalog.list();
    expect(sessionShape).toBeInstanceOf(SessionCatalogError);
    if (sessionShape instanceof SessionCatalogError) {
      expect(sessionShape.message).toBe('OpenCode session list data was not an array');
    }
  });

  it('wraps thrown SDK exceptions instead of rejecting', async () => {
    const harness = createCatalogHarness([], {});
    harness.client.project.list = async () => {
      throw new Error('network down');
    };

    const result = await harness.catalog.list();

    expect(result).toBeInstanceOf(SessionCatalogError);
    if (result instanceof SessionCatalogError) {
      expect(result.message).toBe('OpenCode catalog request failed');
    }
  });

  it('starts with an empty route map and populates it on the first refresh', async () => {
    const harness = createCatalogHarness(
      [
        { id: 'proj-alpha', worktree: ALPHA_WORKTREE },
        { id: 'proj-beta', worktree: BETA_WORKTREE },
      ],
      {
        [ALPHA_WORKTREE]: rawSessions({
          id: 'ses-a1',
          projectID: 'proj-alpha',
          directory: ALPHA_WORKTREE,
          updatedAt: 100,
        }),
        [BETA_WORKTREE]: rawSessions({
          id: 'ses-b1',
          projectID: 'proj-beta',
          directory: BETA_WORKTREE,
          updatedAt: 200,
        }),
      },
    );

    expect(harness.catalog.count()).toBe(0);
    expect(harness.catalog.lookup('ses-a1')).toBeNull();

    const summaries = expectSummaries(await harness.catalog.list());

    expect(harness.catalog.count()).toBe(summaries.length);
    expect(harness.catalog.lookup('ses-a1')).toBe(ALPHA_WORKTREE);
    expect(harness.catalog.lookup('ses-b1')).toBe(BETA_WORKTREE);
    expect(harness.catalog.lookup('ses-unknown')).toBeNull();
  });

  it('replaces route entries on refresh and forgets stale sessions', async () => {
    const sessionsByDirectory: Record<string, unknown[]> = {
      [ALPHA_WORKTREE]: rawSessions({
        id: 'ses-old',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        updatedAt: 100,
      }),
    };
    const harness = createCatalogHarness([{ id: 'proj-alpha', worktree: ALPHA_WORKTREE }], sessionsByDirectory);
    expectSummaries(await harness.catalog.list());
    expect(harness.catalog.lookup('ses-old')).toBe(ALPHA_WORKTREE);

    sessionsByDirectory[ALPHA_WORKTREE] = rawSessions({
      id: 'ses-new',
      projectID: 'proj-alpha',
      directory: ALPHA_WORKTREE,
      updatedAt: 200,
    });

    const summaries = expectSummaries(await harness.catalog.list());

    expect(summaries.map((summary) => summary.id)).toStrictEqual(['ses-new']);
    expect(harness.catalog.lookup('ses-old')).toBeNull();
    expect(harness.catalog.lookup('ses-new')).toBe(ALPHA_WORKTREE);
    expect(harness.catalog.count()).toBe(1);
  });

  it('preserves the previous route map when a refresh fails', async () => {
    const harness = createCatalogHarness([{ id: 'proj-alpha', worktree: ALPHA_WORKTREE }], {
      [ALPHA_WORKTREE]: rawSessions({
        id: 'ses-a1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        updatedAt: 100,
      }),
    });
    expectSummaries(await harness.catalog.list());
    expect(harness.catalog.count()).toBe(1);

    harness.client.session.list = async () => ({
      data: undefined,
      error: { message: 'SDK failed' },
      request: {},
      response: {},
    });
    const failed = await harness.catalog.list();

    expect(failed).toBeInstanceOf(SessionCatalogError);
    expect(harness.catalog.lookup('ses-a1')).toBe(ALPHA_WORKTREE);
    expect(harness.catalog.count()).toBe(1);
  });

  it('clears the route map on demand', async () => {
    const harness = createCatalogHarness([{ id: 'proj-alpha', worktree: ALPHA_WORKTREE }], {
      [ALPHA_WORKTREE]: rawSessions({
        id: 'ses-a1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        updatedAt: 100,
      }),
    });
    expectSummaries(await harness.catalog.list());
    expect(harness.catalog.count()).toBe(1);

    harness.catalog.clear();

    expect(harness.catalog.count()).toBe(0);
    expect(harness.catalog.lookup('ses-a1')).toBeNull();
  });
});
