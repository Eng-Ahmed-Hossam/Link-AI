import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, marketApi, type TeacherSelf, type Verification } from '@link/api-client';
import { formatWeekday } from '@link/i18n';
import { Avatar, Button, Callout, Card, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { num } from '@/format';
import { QueryView } from '@/ui/QueryView';
import { Screen } from '@/ui/Screen';
import { Toggle } from '@/ui/Toggle';

const DAYS = [6, 7, 1, 2, 3, 4];

/**
 * J04 · My profile (MKT-TCH-02): what centres and parents see. Ratings come only from verified
 * parents; verification is done by Link (public only after the national ID, OD-19). "Review each
 * enrolment" (OD-08, off by default) lets the teacher accept or decline new seats on J06.
 */
export default function Profile() {
  const { locale, t } = useLocale();
  const q = useQuery({
    queryKey: ['teacher-self', locale],
    queryFn: () => track(marketApi.teacherSelf()),
  });
  return (
    <Screen title={t('teacher.profile.title')} back testID="screen-j04">
      <QueryView query={q}>{(d) => <ProfileForm d={d} />}</QueryView>
    </Screen>
  );
}

function ProfileForm({ d }: { d: TeacherSelf }) {
  const { locale, t } = useLocale();
  const qc = useQueryClient();
  const [open, setOpen] = useState(d.openToSlots);
  const [review, setReview] = useState(d.reviewEachEnrolment);
  const [about, setAbout] = useState(d.about);
  const [avail, setAvail] = useState(d.availability);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSaved(false), [open, review, about, avail]);
  const save = useMutation({
    mutationFn: () =>
      track(
        marketApi.updateTeacherSelf({
          openToSlots: open,
          reviewEachEnrolment: review,
          about,
          availability: avail,
        }),
      ),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['teacher-self'] });
      void qc.invalidateQueries({ queryKey: ['my-enrolments'] });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.body')),
  });
  const slot = (wd: number) =>
    avail.find((a) => a.weekday === wd) ?? { weekday: wd, am: false, pm: false };
  const toggle = (wd: number, part: 'am' | 'pm') =>
    setAvail((xs) => {
      const cur = slot(wd);
      const next = { ...cur, [part]: !cur[part] };
      return [...xs.filter((a) => a.weekday !== wd), next].sort(
        (a, b) => DAYS.indexOf(a.weekday) - DAYS.indexOf(b.weekday),
      );
    });

  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
          <Avatar locale={locale} name={d.name} tone="blue" size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={textStyle(locale, 'heading')}>{d.name}</Text>
            <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
              {t('teacher.profile.line', {
                subjects: d.subjects,
                years: d.yearsExperience,
                n: num(d.yearsExperience, locale),
              })}
            </Text>
            <Text style={[textStyle(locale, 'caption'), { color: color.amber }]}>
              {d.rating === null
                ? t('teacher.profile.noRating')
                : t('teacher.profile.rating', {
                    rating: num(d.rating, locale),
                    count: d.reviewCount,
                    n: num(d.reviewCount, locale),
                  })}
            </Text>
          </View>
        </View>
        <ToggleRow
          title={t('teacher.profile.open')}
          body={t('teacher.profile.openBody')}
          value={open}
          onChange={setOpen}
          testID="open-to-slots"
        />
      </Card>

      <Card>
        <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
          {t('teacher.profile.verification')}
        </Text>
        <Check state={d.verification.nationalId} title={t('teacher.profile.nationalId')} />
        <Check state={d.verification.degree} title={t('teacher.profile.degree')} />
        <Check
          state={
            d.verification.references.added >= d.verification.references.needed
              ? 'verified'
              : 'pending'
          }
          title={t('teacher.profile.references')}
          body={t('teacher.profile.referencesOf', {
            added: num(d.verification.references.added, locale),
            needed: num(d.verification.references.needed, locale),
          })}
        />
      </Card>

      <Card>
        <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
          {t('teacher.profile.availability')}
        </Text>
        <View style={{ flexDirection: 'row', gap: space[4] }}>
          {DAYS.map((wd) => (
            <View key={wd} style={{ flex: 1, gap: space[4], alignItems: 'stretch' }}>
              <Text
                style={[textStyle(locale, 'caption'), { color: color.muted, textAlign: 'center' }]}
              >
                {formatWeekday(wd, locale)}
              </Text>
              {(['am', 'pm'] as const).map((part) => {
                const on = slot(wd)[part];
                return (
                  <Pressable
                    key={part}
                    onPress={() => toggle(wd, part)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${formatWeekday(wd, locale, 'long')} ${t(`teacher.profile.${part}`)}`}
                    style={[styles.cell, on ? styles.cellOn : null]}
                    testID={`avail-${wd}-${part}`}
                  >
                    <Text
                      style={[
                        textStyle(locale, 'caption'),
                        { color: on ? color.navy : color.muted },
                      ]}
                    >
                      {t(`teacher.profile.${part}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text
          accessibilityRole="header"
          nativeID="about-label"
          style={textStyle(locale, 'heading')}
        >
          {t('teacher.profile.about')}
        </Text>
        <TextInput
          accessibilityLabelledBy="about-label"
          accessibilityLabel={t('teacher.profile.about')}
          value={about}
          onChangeText={setAbout}
          multiline
          maxLength={600}
          style={[textStyle(locale, 'body'), styles.input]}
          testID="about"
        />
      </Card>

      <Card>
        <ToggleRow
          title={t('teacher.profile.reviewEach')}
          body={t('teacher.profile.reviewEachBody')}
          value={review}
          onChange={setReview}
          testID="review-each"
        />
      </Card>

      <Callout locale={locale} tone="info" body={t('teacher.profile.ratingsNote')} />
      {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
      {saved ? (
        <Callout locale={locale} tone="success" role="summary" body={t('teacher.profile.saved')} />
      ) : null}
      <Button
        locale={locale}
        label={t('teacher.profile.save')}
        onPress={() => save.mutate()}
        disabled={save.isPending}
        testID="save-profile"
      />
    </>
  );
}

function ToggleRow({
  title,
  body,
  value,
  onChange,
  testID,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const { locale } = useLocale();
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={textStyle(locale, 'label')}>{title}</Text>
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>{body}</Text>
      </View>
      <Toggle value={value} onValueChange={onChange} label={title} testID={testID} />
    </View>
  );
}

function Check({ state, title, body }: { state: Verification; title: string; body?: string }) {
  const { locale, t } = useLocale();
  const ok = state === 'verified';
  return (
    <View style={{ flexDirection: 'row', gap: space[12], alignItems: 'flex-start' }}>
      <View style={[styles.dot, { backgroundColor: ok ? color.green : color.amberSoft }]}>
        <Text style={{ color: ok ? color.white : color.amber, fontWeight: '700' }}>
          {ok ? '✓' : '!'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={textStyle(locale, 'label')}>{title}</Text>
        <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
          {body ?? t(`teacher.profile.state.${state}`)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    padding: space[12],
    borderRadius: radius[12],
    backgroundColor: color.soft,
  },
  cell: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius[8],
    backgroundColor: color.soft,
  },
  cellOn: { backgroundColor: color.blue },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  input: {
    minHeight: 96,
    padding: space[12],
    borderRadius: radius[12],
    borderWidth: 1,
    borderColor: color.border,
    textAlignVertical: 'top',
  },
});
