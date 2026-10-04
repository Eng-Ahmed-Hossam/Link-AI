import type { Meta, StoryObj } from '@storybook/react-vite';
import { EvidenceList, KpiCard, WhatsAppPreview } from './Followup';

const meta: Meta = { title: 'Follow-up (Phase 2)' };
export default meta;
type S = StoryObj;

export const Kpis: S = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-2 gap-4">
      <KpiCard value="2" label="Follow-ups due" context="1 action is overdue" />
      <KpiCard value="1" label="Overdue action" context="Assigned to Reception" tone="red" />
    </div>
  ),
};

export const Evidence: S = {
  render: () => (
    <EvidenceList
      label="Grounded in records"
      items={[
        {
          id: '1',
          fact: 'Attendance • 30 September • Absent',
          source: 'Session record • confirmed by Ms Salma Fathy',
        },
        {
          id: '2',
          fact: 'Attendance • 3 October • Absent',
          source: 'Session record • confirmed by Ms Salma Fathy',
        },
      ]}
    />
  ),
};

/** V05 · the parent's own WhatsApp — Storybook only, never an app screen (sample data). */
export const V05WhatsAppPreview: S = {
  name: 'V05 WhatsApp preview (Storybook only)',
  render: () => (
    <WhatsAppPreview
      sender="Al Nour Centre"
      text="أهلاً أستاذ حسن، معاك مركز النور 😊 حبينا نطمّن على مريم؛ غابت عن آخر حصتين رياضيات (٣٠ سبتمبر و٣ أكتوبر). لو في أي ظرف أو حاجة نقدر نساعد فيها، ياريت تقولنا. شكرًا!"
      time="9:24"
      status="delivered"
    />
  ),
};
