import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { marketApi } from '@link/api-client';
import { formatDate, formatPercent } from '@link/i18n';
import { Card, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { longDay, num } from '@/format';
import { egp, ruleText } from '@/market/text';
import { QueryView } from '@/ui/QueryView';
import { Screen } from '@/ui/Screen';

const PALETTE = [color.blue, color.amber, color.navy, color.green];

/**
 * J07 · Earnings (MKT-LED-07): what parents paid, Link's booking commission (5%, OD-02, from
 * the server), the rent for each centre on its own line, and the payout — paid out weekly on
 * Thursday (OD-04). Every amount comes from the data; none is typed in (CF-13).
 */
export default function Earnings() {
  const { locale, t } = useLocale();
  const q = useQuery({
    queryKey: ['earnings', locale],
    queryFn: () => track(marketApi.earnings()),
  });
  const month = (m: string) => formatDate(new Date(`${m}-15T12:00:00Z`), locale, { month: 'long' });

  return (
    <Screen
      title={t('teacher.earnings.title')}
      subtitle={q.data ? t('teacher.earnings.lead', { month: month(q.data.month) }) : undefined}
      testID="screen-j07"
    >
      <QueryView query={q}>
        {(d) => {
          const total = d.parentsPaid.amountPt || 1;
          const parts = [
            { key: 'you', label: t('teacher.earnings.you'), pt: d.keep.amountPt, c: color.green },
            { key: 'link', label: t('common.appName'), pt: d.commission.amountPt, c: color.muted },
            ...d.rent.map((r, i) => ({
              key: `${r.centre}-${r.hall}`,
              label: r.centre,
              pt: r.amount.amountPt,
              c: PALETTE[i % PALETTE.length]!,
            })),
          ];
          return (
            <>
              <Card tone="dark" testID="keep">
                <Text style={[textStyle(locale, 'caption'), { color: color.white }]}>
                  {t('teacher.earnings.keepThisMonth')}
                </Text>
                <Text style={[textStyle(locale, 'display'), { color: color.blue }]}>
                  {egp(d.keep, locale)}
                </Text>
                <Text
                  style={[textStyle(locale, 'caption'), { color: color.white }]}
                  testID="next-payout"
                >
                  {t('teacher.earnings.nextPayout', {
                    date: longDay(d.nextPayout.on, locale),
                    account: d.nextPayout.account,
                  })}
                </Text>
              </Card>

              <Card>
                <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
                  {t('teacher.earnings.where')}
                </Text>
                <Row
                  label={t('teacher.earnings.parentsPaid')}
                  value={egp(d.parentsPaid, locale)}
                  strong
                />
                <Row
                  label={t('teacher.earnings.commission', { pct: d.commissionPercent })}
                  value={`−${egp(d.commission, locale)}`}
                  testID="commission"
                />
                {d.rent.map((r) => (
                  <Row
                    key={`${r.centre}-${r.hall}`}
                    label={t('teacher.earnings.rentTo', {
                      centre: r.centre,
                      hall: r.hall,
                      rule: ruleText(r.rule, t, locale),
                    })}
                    value={`−${egp(r.amount, locale)}`}
                    testID="rent-line"
                  />
                ))}
                <View style={styles.between}>
                  <Text style={textStyle(locale, 'label')}>{t('teacher.earnings.payout')}</Text>
                  <Text
                    style={[textStyle(locale, 'heading'), { color: color.green }]}
                    testID="payout"
                  >
                    {egp(d.keep, locale)}
                  </Text>
                </View>
                <View
                  style={styles.bar}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {parts
                    .filter((p) => p.pt > 0)
                    .map((p) => (
                      <View key={p.key} style={{ flex: p.pt / total, backgroundColor: p.c }} />
                    ))}
                </View>
                <View style={styles.legend}>
                  {parts.map((p) => (
                    <View key={p.key} style={styles.legendItem}>
                      <View style={[styles.dot, { backgroundColor: p.c }]} />
                      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                        {p.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>

              <Card>
                <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
                  {t('teacher.earnings.byGroup')}
                </Text>
                {d.byGroup.map((g) => (
                  <View key={g.id} style={styles.group}>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyle(locale, 'label')}>{g.name}</Text>
                      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
                        {t('teacher.earnings.students', {
                          count: g.students,
                          n: num(g.students, locale),
                        })}
                      </Text>
                    </View>
                    <Text style={[textStyle(locale, 'label'), { color: color.blueText }]}>
                      {egp(g.amount, locale)}
                    </Text>
                  </View>
                ))}
              </Card>

              {d.methods.length ? (
                <Card>
                  <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
                    {t('teacher.earnings.howPaid')}
                  </Text>
                  {d.methods.map((m) => (
                    <Row
                      key={m.method}
                      label={t(`teacher.earnings.method.${m.method}`)}
                      value={formatPercent(m.percent / 100, locale)}
                    />
                  ))}
                </Card>
              ) : null}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function Row({
  label,
  value,
  strong,
  testID,
}: {
  label: string;
  value: string;
  strong?: boolean;
  testID?: string;
}) {
  const { locale } = useLocale();
  return (
    <View style={styles.between} testID={testID}>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted, flex: 1 }]}>{label}</Text>
      <Text style={textStyle(locale, strong ? 'label' : 'caption')}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
  },
  bar: { flexDirection: 'row', height: 10, borderRadius: radius[8], overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space[12] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    padding: space[12],
    borderRadius: radius[12],
    backgroundColor: color.soft,
  },
});
