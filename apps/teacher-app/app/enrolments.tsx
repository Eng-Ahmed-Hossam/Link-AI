import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, marketApi, type TeacherEnrolment } from '@link/api-client';
import { Avatar, Button, Callout, Card, StatusBadge, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useState } from 'react';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { egp } from '@/market/text';
import { QueryView } from '@/ui/QueryView';
import { Screen } from '@/ui/Screen';

/**
 * J06 · New enrolments (MKT-ENR-10): parents who chose the teacher's groups, how they pay, and
 * whether the seat is paid or held. Read-only by default: seats are confirmed by payment. Accept /
 * decline appear only with "Review each enrolment" on (OD-08); declining refunds the parent in full.
 */
export default function Enrolments() {
  const { locale, t } = useLocale();
  const q = useQuery({
    queryKey: ['my-enrolments', locale],
    queryFn: () => track(marketApi.myEnrolments()),
  });
  const reviewing = q.data?.some((e) => e.canDecide) ?? false;
  return (
    <Screen
      title={t('teacher.enrolments.title')}
      subtitle={t(reviewing ? 'teacher.enrolments.leadReview' : 'teacher.enrolments.lead')}
      back
      testID="screen-j06"
    >
      <QueryView
        query={q}
        isEmpty={(d) => !d.length}
        empty={{ title: t('teacher.enrolments.emptyTitle') }}
      >
        {(all) => (
          <>
            {all.map((e) => (
              <EnrolmentCard key={e.id} e={e} />
            ))}
            <Callout
              locale={locale}
              tone="info"
              body={t(reviewing ? 'teacher.enrolments.noteReview' : 'teacher.enrolments.note')}
            />
          </>
        )}
      </QueryView>
    </Screen>
  );
}

function EnrolmentCard({ e }: { e: TeacherEnrolment }) {
  const { locale, t } = useLocale();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const decide = useMutation({
    mutationFn: (accept: boolean) =>
      track(accept ? marketApi.acceptEnrolment(e.id) : marketApi.declineEnrolment(e.id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-enrolments'] });
      void qc.invalidateQueries({ queryKey: ['teacher-groups'] });
    },
    onError: (x) =>
      setError(x instanceof ApiError ? (x.problem.detail ?? x.message) : t('states.error.body')),
  });
  const paid = e.paid && e.status !== 'pending_payment';
  const label =
    e.status === 'awaiting_teacher'
      ? t('teacher.enrolments.awaiting')
      : e.status === 'pending_payment'
        ? t('teacher.enrolments.held')
        : e.status === 'declined' || e.status === 'cancelled'
          ? t('teacher.enrolments.declined')
          : paid
            ? t('teacher.enrolments.paid', { amount: egp(e.paid!, locale) })
            : t('teacher.enrolments.confirmed');
  const tone =
    e.status === 'pending_payment' || e.status === 'awaiting_teacher'
      ? 'warning'
      : e.status === 'declined' || e.status === 'cancelled'
        ? 'neutral'
        : 'success';
  return (
    <Card testID={`enrolment-${e.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
        <Avatar locale={locale} name={e.student} tone="blue" />
        <View style={{ flex: 1 }}>
          <Text style={textStyle(locale, 'label')}>{e.student}</Text>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.enrolments.parent', { name: e.parent })}
          </Text>
        </View>
      </View>
      <Text style={textStyle(locale, 'caption')}>
        {e.group.name} • {e.group.centre} • {e.group.room}
      </Text>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
        {t(`teacher.enrolments.plan.${e.plan}`)}
        {e.method ? ` • ${t(`teacher.enrolments.method.${e.method}`)}` : ''}
      </Text>
      <StatusBadge locale={locale} tone={tone} label={label} />
      {e.canDecide && e.status === 'awaiting_teacher' ? (
        <View style={{ gap: space[8] }}>
          <Button
            locale={locale}
            label={t('teacher.enrolments.confirm')}
            onPress={() => decide.mutate(true)}
            disabled={decide.isPending}
            testID={`accept-${e.id}`}
          />
          <Button
            locale={locale}
            variant="secondary"
            danger
            label={t('teacher.enrolments.decline')}
            onPress={() => decide.mutate(false)}
            disabled={decide.isPending}
            testID={`decline-${e.id}`}
          />
        </View>
      ) : null}
      {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
    </Card>
  );
}
