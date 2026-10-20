import { describe, expect, it } from 'vitest';
import {
  STARTER_SECTIONS,
  addEntry,
  addSection,
  canAddSection,
  createResumeContent,
  moveEntry,
  moveSection,
  removeEntry,
  removeSection,
  setEntryVisible,
  updateBasics,
  updateEntryData,
  updateResumeMeta,
  updateSection,
  type NewId,
} from './operations.js';
import { resumeContentSchema, type ResumeContent } from './schema.js';

/** Deterministic UUIDs for readable tests. */
function sequentialIds(): NewId {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`;
}

function fresh() {
  const newId = sequentialIds();
  return { newId, content: createResumeContent({ title: 'CV', template: 'classic' }, newId) };
}

const ids = (content: ResumeContent) => content.sections.map((s) => s.id);
const valid = (content: ResumeContent) => resumeContentSchema.safeParse(content).success;

describe('createResumeContent', () => {
  it('starts with empty basics and the starter sections', () => {
    const { content } = fresh();
    expect(content.basics.fullName).toBe('');
    expect(content.sections.map((s) => [s.type, s.title])).toEqual([
      ['experience', 'Experience'],
      ['education', 'Education'],
      ['skills', 'Skills'],
    ]);
    expect(content.sections).toHaveLength(STARTER_SECTIONS.length);
    expect(valid(content)).toBe(true);
  });

  it('uses crypto UUIDs by default', () => {
    const content = createResumeContent({ title: 'CV', template: 'classic' });
    expect(content.sections[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('edits', () => {
  it('never mutates the input', () => {
    const { content, newId } = fresh();
    const snapshot = structuredClone(content);
    const first = content.sections[0]?.id ?? '';
    addSection(content, 'projects', newId);
    removeSection(content, first);
    moveSection(content, first, 2);
    addEntry(content, first, newId);
    updateBasics(content, { fullName: 'Ada' });
    expect(content).toEqual(snapshot);
  });

  it('adds, updates, hides and removes sections', () => {
    const { content, newId } = fresh();
    let next = addSection(content, 'languages', newId);
    const added = next.sections.at(-1);
    expect(added?.type).toBe('languages');
    expect(added?.title).toBe('Languages');

    next = updateSection(next, added?.id ?? '', { title: 'Spoken languages', visible: false });
    expect(next.sections.at(-1)).toMatchObject({ title: 'Spoken languages', visible: false });

    next = removeSection(next, added?.id ?? '');
    expect(ids(next)).toEqual(ids(content));
    expect(valid(next)).toBe(true);
  });

  it('adds a standard section only once, custom sections any number of times', () => {
    const { content, newId } = fresh();
    expect(canAddSection(content, 'experience')).toBe(false);
    expect(addSection(content, 'experience', newId)).toBe(content);
    expect(canAddSection(content, 'projects')).toBe(true);

    let next = addSection(content, 'projects', newId);
    expect(canAddSection(next, 'projects')).toBe(false);
    next = addSection(addSection(next, 'custom', newId), 'custom', newId);
    const customs = next.sections.filter((s) => s.type === 'custom');
    expect(customs).toHaveLength(2);
    expect(customs[0]?.id).not.toBe(customs[1]?.id);
    expect(canAddSection(next, 'custom')).toBe(true);
    expect(valid(next)).toBe(true);
  });

  it('moves sections, clamping the target index', () => {
    const { content } = fresh();
    const [a, b, c] = ids(content);
    expect(ids(moveSection(content, c ?? '', 0))).toEqual([c, a, b]);
    expect(ids(moveSection(content, a ?? '', 99))).toEqual([b, c, a]);
    expect(ids(moveSection(content, a ?? '', -5))).toEqual([a, b, c]);
  });

  it('adds typed empty entries, edits their data, reorders, hides and removes them', () => {
    const { content, newId } = fresh();
    const experience = content.sections[0]?.id ?? '';
    let next = addEntry(addEntry(content, experience, newId), experience, newId);
    const [first, second] = next.sections[0]?.entries ?? [];
    expect(first?.data).toMatchObject({ position: '', current: false, highlights: [] });

    next = updateEntryData<'experience'>(next, experience, first?.id ?? '', {
      position: 'Engineer',
      highlights: ['Shipped it'],
    });
    expect(next.sections[0]?.entries[0]?.data).toMatchObject({
      position: 'Engineer',
      company: '',
      highlights: ['Shipped it'],
    });

    next = moveEntry(next, experience, second?.id ?? '', 0);
    expect(next.sections[0]?.entries.map((e) => e.id)).toEqual([second?.id, first?.id]);

    next = setEntryVisible(next, experience, first?.id ?? '', false);
    expect(next.sections[0]?.entries[1]?.visible).toBe(false);

    next = removeEntry(next, experience, second?.id ?? '');
    expect(next.sections[0]?.entries).toHaveLength(1);
    expect(valid(next)).toBe(true);
  });

  it('updates basics and resume meta', () => {
    const { content } = fresh();
    const next = updateResumeMeta(updateBasics(content, { fullName: 'Ada Lovelace' }), {
      title: 'Engineering CV',
    });
    expect(next.basics.fullName).toBe('Ada Lovelace');
    expect(next.basics.headline).toBe('');
    expect(next.title).toBe('Engineering CV');
  });

  it('returns the same object for unknown ids', () => {
    const { content, newId } = fresh();
    expect(updateSection(content, 'missing', { title: 'x' })).toBe(content);
    expect(addEntry(content, 'missing', newId)).toBe(content);
  });
});
