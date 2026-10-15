'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import styles from './groups.module.css';

type CampaignSummary = { id: string; name: string; slug: string; status: string };
type Target = {
  id: string;
  name: string;
  externalId: string | null;
  type: string;
  mode: 'API' | 'MANUAL_CONFIRMATION';
  active: boolean;
};
type CampaignDetail = { id: string; name: string; slug: string; targets: Target[] };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? `API trả về ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function normalizeGroupUrl(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('facebook.com/')) return `https://${raw}`;
  if (raw.startsWith('www.facebook.com/')) return `https://${raw}`;
  return raw;
}

function nameFromUrl(url: string, index: number) {
  try {
    const parsed = new URL(normalizeGroupUrl(url));
    const parts = parsed.pathname.split('/').filter(Boolean);
    const groupsIndex = parts.indexOf('groups');
    const value = groupsIndex >= 0 ? parts[groupsIndex + 1] : parts.at(-1);
    if (value) return `Group · ${value}`;
  } catch {}
  return `Facebook Group ${index + 1}`;
}

export default function FacebookGroupsPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [bulk, setBulk] = useState('');
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [search, setSearch] = useState('');
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function loadCampaign(id: string) {
    if (!id) return;
    const detail = await request<CampaignDetail>(`/campaigns/${id}`);
    setCampaign(detail);
    setCampaignId(id);
  }

  async function refresh(preferredId?: string) {
    const list = await request<CampaignSummary[]>('/campaigns');
    setCampaigns(list);
    const next = preferredId && list.some((item) => item.id === preferredId) ? preferredId : list[0]?.id ?? '';
    if (next) await loadCampaign(next);
    else setCampaign(null);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Không tải được dữ liệu')).finally(() => setLoading(false));
  }, []);

  const groups = useMemo(
    () => (campaign?.targets ?? []).filter((item) => item.type === 'FACEBOOK_GROUP'),
    [campaign],
  );
  const visibleGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((item) => `${item.name} ${item.externalId ?? ''}`.toLowerCase().includes(term));
  }, [groups, search]);
  const activeCount = groups.filter((item) => item.active).length;

  function clearMessages() {
    setSuccess('');
    setError('');
  }

  async function addSingle(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/targets`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          externalId: normalizeGroupUrl(url),
          type: 'FACEBOOK_GROUP',
          mode: 'MANUAL_CONFIRMATION',
          connectionId: null,
        }),
      });
      setName('');
      setUrl('');
      await loadCampaign(campaign.id);
      setSuccess('Đã thêm nhóm Facebook vào danh sách phân phối.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thêm nhóm');
    } finally {
      setWorking(false);
    }
  }

  async function addBulk(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    const lines = bulk.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    setWorking(true);
    clearMessages();
    try {
      let created = 0;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const [left, ...rest] = line.split('|');
        const hasPair = rest.length > 0;
        const groupUrl = normalizeGroupUrl(hasPair ? rest.join('|') : left);
        const groupName = hasPair ? left.trim() : nameFromUrl(groupUrl, index);
        await request(`/campaigns/${campaign.id}/targets`, {
          method: 'POST',
          body: JSON.stringify({
            name: groupName || nameFromUrl(groupUrl, index),
            externalId: groupUrl,
            type: 'FACEBOOK_GROUP',
            mode: 'MANUAL_CONFIRMATION',
            connectionId: null,
          }),
        });
        created += 1;
      }
      setBulk('');
      await loadCampaign(campaign.id);
      setSuccess(`Đã nhập ${created} nhóm. Các nhóm đều ở chế độ xác nhận thủ công.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể nhập danh sách nhóm');
    } finally {
      setWorking(false);
    }
  }

  async function toggleGroup(item: Target) {
    if (!campaign) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/targets/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !item.active }),
      });
      await loadCampaign(campaign.id);
      setSuccess(item.active ? 'Đã tạm dừng nhóm.' : 'Đã kích hoạt nhóm.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật nhóm');
    } finally {
      setWorking(false);
    }
  }

  async function removeGroup(item: Target) {
    if (!campaign || !window.confirm(`Tắt nhóm “${item.name}” khỏi chiến dịch?`)) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/targets/${item.id}`, { method: 'DELETE' });
      await loadCampaign(campaign.id);
      setSuccess('Đã tắt nhóm khỏi chiến dịch.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tắt nhóm');
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span className={styles.mark}>A</span>
            <div className={styles.brandText}><strong>AutoSpace</strong><span>Campaign Hub</span></div>
          </div>
          <nav className={styles.nav}>
            <a href="/">Tổng quan</a>
            <a className={styles.active} href="/groups">Nhóm Facebook</a>
            <a href="/live">Đăng Facebook</a>
          </nav>
          <div className={styles.sidebarNote}>Group Registry · chế độ xác nhận thủ công</div>
        </aside>

        <section className={styles.content}>
          <header className={styles.topbar}>
            <div>
              <p className={styles.eyebrow}>FACEBOOK GROUP REGISTRY</p>
              <h1 className={styles.title}>Quản lý nhóm Facebook</h1>
              <p className={styles.subtitle}>Lưu danh sách nhóm theo từng chiến dịch, mở nhanh nhóm và đưa vào hàng đợi xác nhận. AutoSpace không tự đăng bài vào Group qua luồng này.</p>
            </div>
            <select
              className={styles.campaignSelect}
              value={campaignId}
              onChange={(event) => void loadCampaign(event.target.value)}
              disabled={loading || !campaigns.length}
            >
              {campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </header>

          <section className={styles.stats}>
            <article className={styles.stat}><span>Tổng nhóm</span><strong>{groups.length}</strong></article>
            <article className={styles.stat}><span>Đang hoạt động</span><strong>{activeCount}</strong></article>
            <article className={styles.stat}><span>Chế độ</span><strong>Manual</strong></article>
          </section>

          <section className={styles.workspace}>
            <aside className={`${styles.card} ${styles.formCard}`}>
              <div className={styles.sectionHead}>
                <p className={styles.eyebrow}>THÊM NHÓM</p>
                <h2>Group Registry</h2>
                <p>Nhập từng nhóm hoặc dán nhiều nhóm một lần.</p>
              </div>
              <div className={styles.safeBox}>Group được lưu làm target <b>FACEBOOK_GROUP</b> và luôn dùng <b>xác nhận thủ công</b>. Không có auto-post vào Group.</div>
              <div className={styles.tabs}>
                <button type="button" className={mode === 'single' ? styles.activeTab : ''} onClick={() => setMode('single')}>Một nhóm</button>
                <button type="button" className={mode === 'bulk' ? styles.activeTab : ''} onClick={() => setMode('bulk')}>Nhập hàng loạt</button>
              </div>

              {mode === 'single' ? (
                <form className={styles.form} onSubmit={addSingle}>
                  <label>Tên nhóm<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Cộng đồng Hòa Lạc" required /></label>
                  <label>Link nhóm<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://facebook.com/groups/..." required /></label>
                  <button className={styles.primary} disabled={working || !campaign}>{working ? 'ĐANG LƯU…' : '＋ Thêm nhóm'}</button>
                </form>
              ) : (
                <form className={styles.form} onSubmit={addBulk}>
                  <label>Danh sách nhóm<textarea rows={10} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Cộng đồng Hòa Lạc | https://facebook.com/groups/123\nHòa Lạc Review | https://facebook.com/groups/456\nhttps://facebook.com/groups/789'} required /></label>
                  <span className={styles.hint}>Mỗi dòng dùng dạng <b>Tên nhóm | URL</b>. Nếu chỉ dán URL, AutoSpace sẽ tự đặt tên tạm.</span>
                  <button className={styles.primary} disabled={working || !campaign}>{working ? 'ĐANG NHẬP…' : '＋ Nhập danh sách'}</button>
                </form>
              )}
            </aside>

            <section className={`${styles.card} ${styles.listCard}`}>
              <div className={styles.listHead}>
                <div><p className={styles.eyebrow}>DANH SÁCH NHÓM</p><h2>{groups.length} nhóm trong chiến dịch</h2></div>
                <input className={styles.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên hoặc URL nhóm…" />
              </div>

              <div className={styles.groupList}>
                {visibleGroups.map((item) => (
                  <article className={styles.groupRow} key={item.id}>
                    <div className={styles.groupMain}>
                      <div className={styles.groupTop}>
                        <h3>{item.name}</h3>
                        <span className={`${styles.badge} ${!item.active ? styles.badgeOff : ''}`}>{item.active ? 'Đang hoạt động' : 'Tạm dừng'}</span>
                      </div>
                      <span className={styles.url}>{item.externalId || 'Chưa có URL nhóm'}</span>
                    </div>
                    <div className={styles.actions}>
                      {item.externalId && /^https?:\/\//i.test(item.externalId) && <a href={item.externalId} target="_blank" rel="noreferrer">Mở nhóm ↗</a>}
                      <button onClick={() => void toggleGroup(item)} disabled={working}>{item.active ? 'Tạm dừng' : 'Kích hoạt'}</button>
                      <button className={styles.danger} onClick={() => void removeGroup(item)} disabled={working}>Tắt</button>
                    </div>
                  </article>
                ))}
                {!visibleGroups.length && <div className={styles.empty}>{groups.length ? 'Không tìm thấy nhóm phù hợp.' : 'Chưa có nhóm Facebook nào trong chiến dịch này.'}</div>}
              </div>
            </section>
          </section>
        </section>
      </div>
      {(success || error) && <div className={`${styles.notice} ${error ? styles.error : ''}`}>{error || success}</div>}
    </main>
  );
}
