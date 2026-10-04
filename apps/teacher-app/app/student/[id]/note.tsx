import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fuApi, type NoteTag } from '@link/api-client';
import { Avatar, Button, Callout, Chip, TextField, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { isNetworkError, track } from '@/net';
import { TOPICS, useTopicLabel } from '@/topics';

const MAX = 500;

/**
 * T11 / AR05 · Note about a student (FUP-REC-10), as a bottom sheet. Topic (one of five), up to
 * 500 characters, visibility "Teachers & centre admin" (internal). "Suggest for a parent update"
 * sends the note to centre staff to review and rewrite — never to the parent (BR-APR-13).
 */
export default function NoteSheet() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const { locale, t } = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const topicLabel = useTopicLabel();
  const student = useQuery({
    queryKey: ['student', id, locale],
    queryFn: () => track(fuApi.student(id)),
  });
  const [tag, setTag] = useState<NoteTag | null>(null);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'internal' | 'suggested_for_parent'>('internal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const length = [...body].length;
  const name = student.data?.student.displayName ?? '';

  async function save() {
    if (!tag || !body.trim()) {
      setError(t('teacher.note.needTopicAndText'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const n = await track(fuApi.addNote(id, { groupId, tag, body: body.trim() }));
      if (visibility === 'suggested_for_parent') await track(fuApi.suggestNote(n.id));
      await qc.invalidateQueries({ queryKey: ['student', id] });
      await qc.invalidateQueries({ queryKey: ['roster'] });
      router.back();
    } catch (e) {
      setError(isNetworkError(e) ? t('states.offline.body') : t('states.error.body'));
    } finally {
      setBusy(false);
    }
  }

  const option = (value: typeof visibility, title: string, desc: string) => {
    const on = visibility === value;
    return (
      <Pressable
        testID={`visibility-${value}`}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        onPress={() => setVisibility(value)}
        style={{
          padding: space[12],
          borderRadius: radius[12],
          borderWidth: on ? 2 : 1,
          borderColor: on ? color.blue : color.border,
          backgroundColor: on ? color.blueSoft : color.white,
          gap: 2,
        }}
      >
        <Text style={textStyle(locale, 'label')}>
          {on ? '◉ ' : '○ '}
          {title}
        </Text>
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>{desc}</Text>
      </Pressable>
    );
  };

  return (
    <View
      style={{ flex: 1, justifyContent: 'flex-end', direction: locale === 'ar' ? 'rtl' : 'ltr' }}
    >
      <Pressable
        accessibilityLabel={t('common.close')}
        onPress={() => router.back()}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          start: 0,
          end: 0,
          backgroundColor: color.navy,
          opacity: 0.4,
        }}
      />
      <View
        testID="screen-t11"
        accessibilityViewIsModal
        style={{
          maxHeight: '92%',
          backgroundColor: color.white,
          borderTopStartRadius: radius[24],
          borderTopEndRadius: radius[24],
        }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space[20], gap: space[16] }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: color.border,
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
            {name ? <Avatar locale={locale} name={name} /> : null}
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
                {t('teacher.note.title', { name })}
              </Text>
              <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                {student.data?.group.name ?? ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => router.back()}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={textStyle(locale, 'heading')}>{'×'}</Text>
            </Pressable>
          </View>

          <Text style={textStyle(locale, 'label')}>{t('teacher.note.topic')}</Text>
          <View
            accessibilityRole="radiogroup"
            testID="topics"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8] }}
          >
            {TOPICS.map((x) => (
              <Chip
                key={x}
                locale={locale}
                testID={`topic-${x}`}
                label={topicLabel(x)}
                selected={tag === x}
                onPress={() => setTag(x)}
              />
            ))}
          </View>

          <TextField
            locale={locale}
            testID="note-body"
            label={t('teacher.note.text')}
            multiline
            maxLength={MAX}
            value={body}
            onChangeText={(v) => setBody([...v].slice(0, MAX).join(''))}
            help={t('common.counter', { n: length, max: MAX })}
          />

          <Text style={textStyle(locale, 'label')}>{t('teacher.note.whoSees')}</Text>
          <View accessibilityRole="radiogroup" style={{ gap: space[8] }}>
            {option(
              'internal',
              t('teacher.note.visibilityInternal'),
              t('teacher.note.visibilityInternalDesc'),
            )}
            {option(
              'suggested_for_parent',
              t('teacher.note.suggest'),
              t('teacher.note.suggestDesc'),
            )}
          </View>

          {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
          <Button
            locale={locale}
            testID="save-note"
            label={busy ? t('common.loading') : t('teacher.note.save')}
            disabled={busy}
            onPress={save}
          />
          <Button
            locale={locale}
            variant="quiet"
            label={t('common.cancel')}
            onPress={() => router.back()}
          />
        </ScrollView>
      </View>
    </View>
  );
}
