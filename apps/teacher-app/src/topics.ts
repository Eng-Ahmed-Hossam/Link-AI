import type { NoteTag } from '@link/api-client';
import { useLocale } from './locale';

export const TOPICS: NoteTag[] = [
  'understanding',
  'needs_revisit',
  'behaviour',
  'positive',
  'absence_context',
];

/** Note topics (FUP-REC-10 AC1). */
export function useTopicLabel() {
  const { t } = useLocale();
  return (tag: NoteTag) =>
    ({
      understanding: t('teacher.note.topicUnderstanding'),
      needs_revisit: t('teacher.note.topicRevisit'),
      behaviour: t('teacher.note.topicBehaviour'),
      positive: t('teacher.note.topicPositive'),
      absence_context: t('teacher.note.topicAbsence'),
    })[tag];
}
