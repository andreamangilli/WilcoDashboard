import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';

export type KlaviyoCampaign = {
  id: string;
  klaviyo_id: string;
  name: string;
  status: string;
  channel: string;
  send_time: string | null;
  recipients: number;
  opens: number;
  clicks: number;
  conversions: number;
  revenue: number;
  unsubscribes: number;
  open_rate: number;
  click_rate: number;
};

export const getKlaviyoCampaigns = unstable_cache(
  async (): Promise<KlaviyoCampaign[]> => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('klaviyo_campaigns')
      .select('*')
      .order('send_time', { ascending: false, nullsFirst: false });

    return (data || []).map((row) => ({
      id: row.id,
      klaviyo_id: row.klaviyo_id,
      name: row.name || '',
      status: row.status || '',
      channel: row.channel || 'email',
      send_time: row.send_time,
      recipients: row.recipients || 0,
      opens: row.opens || 0,
      clicks: row.clicks || 0,
      conversions: row.conversions || 0,
      revenue: row.revenue || 0,
      unsubscribes: row.unsubscribes || 0,
      open_rate: row.open_rate || 0,
      click_rate: row.click_rate || 0,
    }));
  },
  ['klaviyo-campaigns-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);

export const getKlaviyoOverview = unstable_cache(
  async () => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('klaviyo_campaigns')
      .select('recipients, opens, clicks, conversions, revenue, unsubscribes, open_rate, click_rate, channel')
      .eq('status', 'Sent');

    const email = { recipients: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0, unsubscribes: 0, count: 0, weighted_open_rate: 0, weighted_click_rate: 0 };
    const sms = { recipients: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0, count: 0 };

    for (const row of data || []) {
      if (row.channel === 'sms') {
        sms.recipients += row.recipients || 0;
        sms.clicks += row.clicks || 0;
        sms.conversions += row.conversions || 0;
        sms.revenue += row.revenue || 0;
        sms.count++;
      } else {
        const recip = row.recipients || 0;
        email.recipients += recip;
        email.opens += row.opens || 0;
        email.clicks += row.clicks || 0;
        email.conversions += row.conversions || 0;
        email.revenue += row.revenue || 0;
        email.unsubscribes += row.unsubscribes || 0;
        email.weighted_open_rate += (row.open_rate || 0) * recip;
        email.weighted_click_rate += (row.click_rate || 0) * recip;
        email.count++;
      }
    }

    return {
      email: {
        ...email,
        open_rate: email.recipients > 0 ? email.weighted_open_rate / email.recipients : 0,
        click_rate: email.recipients > 0 ? email.weighted_click_rate / email.recipients : 0,
      },
      sms,
      total: {
        revenue: email.revenue + sms.revenue,
        conversions: email.conversions + sms.conversions,
        campaigns: email.count + sms.count,
      },
    };
  },
  ['klaviyo-overview-v1'],
  { revalidate: 1800, tags: ['dashboard-data'] }
);
