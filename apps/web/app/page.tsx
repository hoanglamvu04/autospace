'use client';

import { FormEvent, useEffect, useState } from 'react';

type CampaignSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count: { contentVariants: number; targets: number; runs: number };
  runs: Array<{ id: string; status: string; createdAt: string }>;
};

type ContentVariant = {
  id: string;
  title: string | null;
  body: string;
  mediaUrl: string | null;
};

type DistributionTarget = {
  id: string;
  name: string;
  externalId: string | null;
  type: string;
  mode: 'API' | 'MANUAL_CONFIRMATION';
  active: boolean;
};

type PublishJob = {
  id: string;
  status: string;
  error: string | null;
  resultUrl: string | null;
  target: DistributionTarget;
  contentVariant: ContentVariant | null;
};

type CampaignRun = {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  publishJobs: PublishJob[];
};

type CampaignDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  contentVariants: ContentVariant[];
  targets: DistributionTarget[];
  runs: CampaignRun[];
};

type RunResult = {
  campaignId: string;
  runId: string;
  queued: number;
  apiTargets: number;
  manualTargets: number;
  status: string;
  mode?: string;
};

type View = 'overview' | 'campaign' | 'content' | 'targets' | 'runs';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const campaignStatuses = ['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED'];
const targetTypes = ['FACEBOOK_PAGE', 'FACEBOOK_GROUP', 'WEBSITE', 'OTHER'];

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? `API trả về ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Bản nháp',
    SCHEDULED: 'Đã lên lịch',
    RUNNING: 'Đang chạy',
    PAUSED: 'Tạm dừng',
    PREPARED: 'Dry run hoàn tất',
    COMPLETED: 'Hoàn tất',
    FAILED: 'Lỗi',
    QUEUED: 'Đang chờ',
    READY_FOR_PROVIDER: 'Sẵn sàng cho provider',
    AWAITING_CONFIRMATION: 'Chờ xác nhận',
  };
  return labels[value] ?? value;
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
}

function statsForRun(run?: CampaignRun) {
  const jobs = run?.publishJobs ?? [];
  const count = (status: string) => jobs.filter((job) => job.status === status).length;
  const queued = count('QUEUED');
  const running = count('RUNNING');
  const ready = count('READY_FOR_PROVIDER');
  const manual = count('AWAITING_CONFIRMATION');
  const failed = count('FAILED');
  const completed = count('COMPLETED');
  const resolved = ready + manual + failed + completed;
  const progress = jobs.length ? Math.round((resolved / jobs.length) * 100) : 0;
  return { total: jobs.length, queued, running, ready, manual, failed, completed, progress };
}

export default function HomePage() {
  const [view, setView] = useState<View>('overview');
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [running, setRunning] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignSlug, setNewCampaignSlug] = useState('');
  const [editCampaignName, setEditCampaignName] = useState('');
  const [editCampaignSlug, setEditCampaignSlug] = useState('');
  const [editCampaignStatus, setEditCampaignStatus] = useState('DRAFT');

  const [contentTitle, setContentTitle] = useState('');
  const [contentBody, setContentBody] = useState('');
  const [contentMediaUrl, setContentMediaUrl] = useState('');
  const [editingContentId, setEditingContentId] = useState('');
  const [editContentTitle, setEditContentTitle] = useState('');
  const [editContentBody, setEditContentBody] = useState('');
  const [editContentMediaUrl, setEditContentMediaUrl] = useState('');

  const [targetName, setTargetName] = useState('');
  const [targetExternalId, setTargetExternalId] = useState('');
  const [targetType, setTargetType] = useState('FACEBOOK_PAGE');
  const [targetMode, setTargetMode] = useState<'API' | 'MANUAL_CONFIRMATION'>('MANUAL_CONFIRMATION');
  const [editingTargetId, setEditingTargetId] = useState('');
  const [editTargetName, setEditTargetName] = useState('');
  const [editTargetExternalId, setEditTargetExternalId] = useState('');
  const [editTargetType, setEditTargetType] = useState('FACEBOOK_PAGE');
  const [editTargetMode, setEditTargetMode] = useState<'API' | 'MANUAL_CONFIRMATION'>('MANUAL_CONFIRMATION');

  async function refresh(preferredId?: string) {
    const list = await request<CampaignSummary[]>('/campaigns');
    setCampaigns(list);

    if (!list.length) {
      setSelectedId('');
      setCampaign(null);
      return;
    }

    const nextId = preferredId && list.some((item) => item.id === preferredId) ? preferredId : list[0].id;
    setSelectedId(nextId);
    const detail = await request<CampaignDetail>(`/campaigns/${nextId}`);
    setCampaign(detail);
  }

  async function refreshDetail(id: string) {
    const detail = await request<CampaignDetail>(`/campaigns/${id}`);
    setCampaign(detail);
  }

  async function loadCampaign(id: string) {
    setSelectedId(id);
    setLoading(true);
    setError('');
    try {
      await refreshDetail(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải chiến dịch');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!campaign) return;
    setEditCampaignName(campaign.name);
    setEditCampaignSlug(campaign.slug);
    setEditCampaignStatus(campaign.status);
  }, [campaign?.id, campaign?.name, campaign?.slug, campaign?.status]);

  const hasLiveRun = campaign?.runs.some((run) => run.status === 'QUEUED' || run.status === 'RUNNING') ?? false;

  useEffect(() => {
    if (view !== 'runs' || !selectedId || !hasLiveRun) return;
    const timer = window.setInterval(() => {
      void refreshDetail(selectedId).catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [view, selectedId, hasLiveRun]);

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  async function bootstrapDemo() {
    setWorking(true);
    clearMessages();
    try {
      const created = await request<CampaignDetail>('/campaigns/bootstrap-demo', { method: 'POST' });
      await refresh(created.id);
      setSuccess('Đã tạo dữ liệu Hola Halo trong PostgreSQL.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo dữ liệu mẫu');
    } finally {
      setWorking(false);
      setLoading(false);
    }
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    clearMessages();
    try {
      const created = await request<{ id: string }>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name: newCampaignName, slug: newCampaignSlug || undefined }),
      });
      setNewCampaignName('');
      setNewCampaignSlug('');
      await refresh(created.id);
      setSuccess('Đã tạo chiến dịch mới.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo chiến dịch');
    } finally {
      setWorking(false);
    }
  }

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editCampaignName, slug: editCampaignSlug, status: editCampaignStatus }),
      });
      await refresh(campaign.id);
      setSuccess('Đã lưu thông tin chiến dịch.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu chiến dịch');
    } finally {
      setWorking(false);
    }
  }

  async function deleteCampaign() {
    if (!campaign || !window.confirm(`Xóa chiến dịch “${campaign.name}”? Dữ liệu run liên quan cũng sẽ bị xóa.`)) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}`, { method: 'DELETE' });
      await refresh();
      setSuccess('Đã xóa chiến dịch.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa chiến dịch');
    } finally {
      setWorking(false);
    }
  }

  async function addContent(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/content`, {
        method: 'POST',
        body: JSON.stringify({ title: contentTitle || null, body: contentBody, mediaUrl: contentMediaUrl || null }),
      });
      setContentTitle('');
      setContentBody('');
      setContentMediaUrl('');
      await refresh(campaign.id);
      setSuccess('Đã thêm biến thể nội dung.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thêm nội dung');
    } finally {
      setWorking(false);
    }
  }

  function startEditContent(item: ContentVariant) {
    setEditingContentId(item.id);
    setEditContentTitle(item.title ?? '');
    setEditContentBody(item.body);
    setEditContentMediaUrl(item.mediaUrl ?? '');
  }

  async function saveContent(contentId: string) {
    if (!campaign) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/content/${contentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editContentTitle || null, body: editContentBody, mediaUrl: editContentMediaUrl || null }),
      });
      setEditingContentId('');
      await refresh(campaign.id);
      setSuccess('Đã cập nhật nội dung.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật nội dung');
    } finally {
      setWorking(false);
    }
  }

  async function deleteContent(contentId: string) {
    if (!campaign || !window.confirm('Xóa biến thể nội dung này?')) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/content/${contentId}`, { method: 'DELETE' });
      await refresh(campaign.id);
      setSuccess('Đã xóa nội dung.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa nội dung');
    } finally {
      setWorking(false);
    }
  }

  async function addTarget(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/targets`, {
        method: 'POST',
        body: JSON.stringify({ name: targetName, externalId: targetExternalId || null, type: targetType, mode: targetMode }),
      });
      setTargetName('');
      setTargetExternalId('');
      setTargetType('FACEBOOK_PAGE');
      setTargetMode('MANUAL_CONFIRMATION');
      await refresh(campaign.id);
      setSuccess('Đã thêm điểm phân phối.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thêm target');
    } finally {
      setWorking(false);
    }
  }

  function startEditTarget(item: DistributionTarget) {
    setEditingTargetId(item.id);
    setEditTargetName(item.name);
    setEditTargetExternalId(item.externalId ?? '');
    setEditTargetType(item.type);
    setEditTargetMode(item.mode);
  }

  async function saveTarget(targetId: string) {
    if (!campaign) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/targets/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editTargetName, externalId: editTargetExternalId || null, type: editTargetType, mode: editTargetMode }),
      });
      setEditingTargetId('');
      await refresh(campaign.id);
      setSuccess('Đã cập nhật target.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật target');
    } finally {
      setWorking(false);
    }
  }

  async function toggleTarget(item: DistributionTarget) {
    if (!campaign) return;
    setWorking(true);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/targets/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !item.active }),
      });
      await refresh(campaign.id);
      setSuccess(item.active ? 'Đã tạm ngừng target.' : 'Đã kích hoạt target.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đổi trạng thái target');
    } finally {
      setWorking(false);
    }
  }

  async function runCampaign() {
    if (!campaign) return;
    setRunning(true);
    clearMessages();
    try {
      const run = await request<RunResult>(`/campaigns/${campaign.id}/run`, { method: 'POST' });
      setResult(run);
      await refresh(campaign.id);
      setView('runs');
      setSuccess(`Dry Run đã tạo ${run.queued} job. Không có bài nào được đăng ra ngoài.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể chạy dry run');
    } finally {
      setRunning(false);
    }
  }

  async function retryJob(runId: string, jobId: string) {
    if (!campaign) return;
    setRetryingJobId(jobId);
    clearMessages();
    try {
      await request(`/campaigns/${campaign.id}/runs/${runId}/jobs/${jobId}/retry`, { method: 'POST' });
      await refreshDetail(campaign.id);
      setSuccess('Đã đưa job lỗi trở lại hàng đợi Dry Run.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể chạy lại job');
    } finally {
      setRetryingJobId('');
    }
  }

  const latestRun = campaign?.runs[0];
  const latestStats = statsForRun(latestRun);
  const activeTargets = campaign?.targets.filter((target) => target.active) ?? [];
  const apiTargets = activeTargets.filter((target) => target.mode === 'API').length;
  const manualTargets = activeTargets.length - apiTargets;

  const nav: Array<{ id: View; label: string }> = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'campaign', label: 'Chiến dịch' },
    { id: 'content', label: 'Nội dung' },
    { id: 'targets', label: 'Kênh phân phối' },
    { id: 'runs', label: 'Hàng đợi & kết quả' },
  ];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">A</span><div><strong>AutoSpace</strong><small>Campaign Hub</small></div></div>
        <nav>
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>{item.label}</button>
          ))}
        </nav>
        <div className="sidebarFoot">MVP · v0.4.0 · Dry Run</div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TRUNG TÂM CHIẾN DỊCH</p>
            <h1>{campaign?.name ?? 'AutoSpace Campaign Hub'}</h1>
          </div>
          <div className="topActions">
            {campaigns.length > 0 && (
              <select className="campaignSelect" value={selectedId} onChange={(event) => void loadCampaign(event.target.value)}>
                {campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <span className="status"><i /> {loading ? 'Đang tải' : statusLabel(campaign?.status ?? 'Chưa có chiến dịch')}</span>
          </div>
        </header>

        {!campaign ? (
          <section className="emptyState">
            <div>
              <span className="pill darkPill">DATABASE TRỐNG</span>
              <h2>Tạo chiến dịch đầu tiên để bắt đầu.</h2>
              <p>Bạn có thể tạo nhanh bộ Hola Halo mẫu hoặc tạo một campaign trống từ tab Chiến dịch.</p>
              <button className="primaryButton" onClick={bootstrapDemo} disabled={working}>{working ? 'ĐANG TẠO…' : '＋ TẠO HOLA HALO MẪU'}</button>
            </div>
          </section>
        ) : (
          <>
            {view === 'overview' && (
              <>
                <section className="heroCard">
                  <div>
                    <div className="heroPills"><span className="pill">{campaign.slug.toUpperCase()}</span><span className="pill safePill">DRY RUN · KHÔNG ĐĂNG THẬT</span></div>
                    <h2>Chạy thử toàn bộ luồng trước khi kết nối Facebook thật.</h2>
                    <p>AutoSpace sẽ tạo Campaign Run, gán caption cho từng target, đưa job qua Redis/BullMQ và để worker xử lý. API target dừng ở “Sẵn sàng cho provider”; group cần thao tác người dùng dừng ở “Chờ xác nhận”.</p>
                  </div>
                  <button className="runButton" onClick={runCampaign} disabled={running || !activeTargets.length || !campaign.contentVariants.length}>
                    {running ? 'ĐANG TẠO DRY RUN…' : '▶  CHẠY DRY RUN'}
                  </button>
                </section>

                <section className="metrics">
                  <article><span>Điểm phân phối</span><strong>{activeTargets.length}</strong><small>{apiTargets} API · {manualTargets} xác nhận</small></article>
                  <article><span>Biến thể nội dung</span><strong>{campaign.contentVariants.length}</strong><small>Sẵn sàng để phân phối</small></article>
                  <article><span>Dry Run gần nhất</span><strong>{latestStats.total}</strong><small>{statusLabel(latestRun?.status ?? 'Chưa chạy')}</small></article>
                  <article><span>Tiến độ run</span><strong>{latestStats.progress}%</strong><small>{latestStats.ready} provider · {latestStats.manual} xác nhận</small></article>
                </section>

                <section className="twoCol">
                  <section className="panel">
                    <div className="panelHead"><div><p className="eyebrow">PHÂN PHỐI</p><h3>Target đang hoạt động</h3></div><button className="textButton" onClick={() => setView('targets')}>Quản lý</button></div>
                    {activeTargets.length ? activeTargets.slice(0, 5).map((target) => (
                      <div className="targetRow" key={target.id}>
                        <div><b>{target.name}</b><small>{target.externalId ?? target.type}</small></div>
                        <em className={target.mode === 'API' ? 'apiTag' : 'manualTag'}>{target.mode === 'API' ? 'API' : 'XÁC NHẬN'}</em>
                      </div>
                    )) : <div className="emptyRow">Chưa có target đang hoạt động.</div>}
                  </section>

                  <section className="panel">
                    <div className="panelHead"><div><p className="eyebrow">NỘI DUNG</p><h3>Biến thể gần nhất</h3></div><button className="textButton" onClick={() => setView('content')}>Quản lý</button></div>
                    {campaign.contentVariants.length ? campaign.contentVariants.slice(0, 4).map((item, index) => (
                      <div className="contentPreview" key={item.id}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{item.title || 'Không tiêu đề'}</b><p>{item.body}</p></div></div>
                    )) : <div className="emptyRow">Chưa có biến thể nội dung.</div>}
                  </section>
                </section>
              </>
            )}

            {view === 'campaign' && (
              <section className="managementGrid">
                <section className="formCard">
                  <div className="sectionTitle"><p className="eyebrow">TẠO MỚI</p><h2>Chiến dịch mới</h2><p>Tạo campaign trống rồi bổ sung nội dung và target ở các tab bên cạnh.</p></div>
                  <form onSubmit={createCampaign} className="formStack">
                    <label>Tên chiến dịch<input value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} placeholder="Ví dụ: Hola Halo 2026" required /></label>
                    <label>Slug<input value={newCampaignSlug} onChange={(e) => setNewCampaignSlug(e.target.value)} placeholder="Để trống để tự tạo" /></label>
                    <button className="primaryButton" disabled={working}>＋ Tạo chiến dịch</button>
                  </form>
                </section>

                <section className="formCard">
                  <div className="sectionTitle"><p className="eyebrow">ĐANG CHỌN</p><h2>Chỉnh sửa chiến dịch</h2><p>ID: {shortId(campaign.id)}</p></div>
                  <form onSubmit={saveCampaign} className="formStack">
                    <label>Tên chiến dịch<input value={editCampaignName} onChange={(e) => setEditCampaignName(e.target.value)} required /></label>
                    <label>Slug<input value={editCampaignSlug} onChange={(e) => setEditCampaignSlug(e.target.value)} required /></label>
                    <label>Trạng thái<select value={editCampaignStatus} onChange={(e) => setEditCampaignStatus(e.target.value)}>{campaignStatuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
                    <div className="buttonRow"><button className="primaryButton" disabled={working}>Lưu thay đổi</button><button type="button" className="dangerButton" onClick={deleteCampaign} disabled={working}>Xóa chiến dịch</button></div>
                  </form>
                </section>
              </section>
            )}

            {view === 'content' && (
              <section className="workspace">
                <section className="formCard compactForm">
                  <div className="sectionTitle"><p className="eyebrow">CONTENT VARIANT</p><h2>Thêm nội dung</h2><p>Tạo nhiều biến thể để hệ thống có thể phân bổ cho từng target.</p></div>
                  <form onSubmit={addContent} className="formStack">
                    <label>Tiêu đề<input value={contentTitle} onChange={(e) => setContentTitle(e.target.value)} placeholder="Ví dụ: Giới thiệu cuộc thi" /></label>
                    <label>Nội dung<textarea value={contentBody} onChange={(e) => setContentBody(e.target.value)} placeholder="Nhập caption hoặc nội dung bài đăng…" rows={7} required /></label>
                    <label>Media URL<input value={contentMediaUrl} onChange={(e) => setContentMediaUrl(e.target.value)} placeholder="https://..." /></label>
                    <button className="primaryButton" disabled={working}>＋ Thêm biến thể</button>
                  </form>
                </section>

                <section className="listPanel">
                  <div className="listHeader"><div><p className="eyebrow">THƯ VIỆN</p><h2>{campaign.contentVariants.length} biến thể nội dung</h2></div></div>
                  {campaign.contentVariants.map((item, index) => (
                    <article className="contentCard" key={item.id}>
                      {editingContentId === item.id ? (
                        <div className="formStack">
                          <label>Tiêu đề<input value={editContentTitle} onChange={(e) => setEditContentTitle(e.target.value)} /></label>
                          <label>Nội dung<textarea rows={6} value={editContentBody} onChange={(e) => setEditContentBody(e.target.value)} /></label>
                          <label>Media URL<input value={editContentMediaUrl} onChange={(e) => setEditContentMediaUrl(e.target.value)} /></label>
                          <div className="buttonRow"><button className="primaryButton smallButton" onClick={() => void saveContent(item.id)} disabled={working}>Lưu</button><button className="secondaryButton smallButton" onClick={() => setEditingContentId('')}>Hủy</button></div>
                        </div>
                      ) : (
                        <>
                          <div className="contentCardTop"><span className="indexBadge">{String(index + 1).padStart(2, '0')}</span><div className="cardActions"><button onClick={() => startEditContent(item)}>Sửa</button><button className="dangerText" onClick={() => void deleteContent(item.id)}>Xóa</button></div></div>
                          <h3>{item.title || 'Không tiêu đề'}</h3>
                          <p>{item.body}</p>
                          {item.mediaUrl && <small className="urlText">{item.mediaUrl}</small>}
                        </>
                      )}
                    </article>
                  ))}
                  {!campaign.contentVariants.length && <div className="emptyRow largeEmpty">Chưa có nội dung. Hãy tạo biến thể đầu tiên ở cột bên trái.</div>}
                </section>
              </section>
            )}

            {view === 'targets' && (
              <section className="workspace">
                <section className="formCard compactForm">
                  <div className="sectionTitle"><p className="eyebrow">ĐIỂM PHÂN PHỐI</p><h2>Thêm target</h2><p>Chỉ dùng chế độ API khi kênh có quyền xuất bản hợp lệ. Các trường hợp còn lại để ở chế độ xác nhận.</p></div>
                  <form onSubmit={addTarget} className="formStack">
                    <label>Tên target<input value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder="Ví dụ: Facebook Page · Hola" required /></label>
                    <label>External ID<input value={targetExternalId} onChange={(e) => setTargetExternalId(e.target.value)} placeholder="Page ID / định danh nội bộ" /></label>
                    <label>Loại<select value={targetType} onChange={(e) => setTargetType(e.target.value)}>{targetTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                    <label>Chế độ<select value={targetMode} onChange={(e) => setTargetMode(e.target.value as 'API' | 'MANUAL_CONFIRMATION')}><option value="MANUAL_CONFIRMATION">Cần xác nhận</option><option value="API">API được cấp quyền</option></select></label>
                    <button className="primaryButton" disabled={working}>＋ Thêm target</button>
                  </form>
                </section>

                <section className="listPanel">
                  <div className="listHeader"><div><p className="eyebrow">DANH SÁCH</p><h2>{campaign.targets.length} target</h2></div><span className="counterBadge">{activeTargets.length} đang hoạt động</span></div>
                  {campaign.targets.map((item) => (
                    <article className={`targetCard ${!item.active ? 'inactiveCard' : ''}`} key={item.id}>
                      {editingTargetId === item.id ? (
                        <div className="formStack">
                          <label>Tên<input value={editTargetName} onChange={(e) => setEditTargetName(e.target.value)} /></label>
                          <label>External ID<input value={editTargetExternalId} onChange={(e) => setEditTargetExternalId(e.target.value)} /></label>
                          <div className="formTwoCol"><label>Loại<select value={editTargetType} onChange={(e) => setEditTargetType(e.target.value)}>{targetTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Chế độ<select value={editTargetMode} onChange={(e) => setEditTargetMode(e.target.value as 'API' | 'MANUAL_CONFIRMATION')}><option value="MANUAL_CONFIRMATION">Cần xác nhận</option><option value="API">API</option></select></label></div>
                          <div className="buttonRow"><button className="primaryButton smallButton" onClick={() => void saveTarget(item.id)} disabled={working}>Lưu</button><button className="secondaryButton smallButton" onClick={() => setEditingTargetId('')}>Hủy</button></div>
                        </div>
                      ) : (
                        <>
                          <div className="targetCardMain"><div><div className="targetTitle"><h3>{item.name}</h3><span className={item.active ? 'liveDot' : 'offDot'}>{item.active ? 'Hoạt động' : 'Tạm dừng'}</span></div><p>{item.externalId || item.type}</p></div><em className={item.mode === 'API' ? 'apiTag' : 'manualTag'}>{item.mode === 'API' ? 'API' : 'XÁC NHẬN'}</em></div>
                          <div className="cardActions wideActions"><button onClick={() => startEditTarget(item)}>Sửa</button><button onClick={() => void toggleTarget(item)}>{item.active ? 'Tạm dừng' : 'Kích hoạt'}</button></div>
                        </>
                      )}
                    </article>
                  ))}
                </section>
              </section>
            )}

            {view === 'runs' && (
              <section className="runsPage">
                <div className="runsHeader">
                  <div><p className="eyebrow">DRY RUN MONITOR</p><h2>Hàng đợi & kết quả</h2><p>Tự làm mới khi run đang chạy. Dry Run không gọi API đăng bài ra bên ngoài.</p></div>
                  <div className="buttonRow"><button className="secondaryButton" onClick={() => void refreshDetail(campaign.id)}>↻ Làm mới</button><button className="primaryButton" onClick={runCampaign} disabled={running}>{running ? 'Đang tạo…' : '▶ Dry Run mới'}</button></div>
                </div>

                {latestRun && (
                  <section className="runSummary">
                    <div className="runSummaryTop"><div><span>RUN GẦN NHẤT</span><strong>{statusLabel(latestRun.status)}</strong></div><b>{latestStats.progress}%</b></div>
                    <div className="progressTrack"><span style={{ width: `${latestStats.progress}%` }} /></div>
                    <div className="runCounters">
                      <div><b>{latestStats.total}</b><span>Tổng job</span></div>
                      <div><b>{latestStats.queued}</b><span>Đang chờ</span></div>
                      <div><b>{latestStats.running}</b><span>Đang xử lý</span></div>
                      <div><b>{latestStats.ready}</b><span>Chờ provider</span></div>
                      <div><b>{latestStats.manual}</b><span>Chờ xác nhận</span></div>
                      <div><b>{latestStats.failed}</b><span>Lỗi</span></div>
                    </div>
                  </section>
                )}

                {campaign.runs.map((run) => {
                  const stats = statsForRun(run);
                  return (
                    <article className="runCard" key={run.id}>
                      <div className="runTop">
                        <div><span className="runId">DRY RUN · {shortId(run.id)}</span><h3>{statusLabel(run.status)}</h3><small>{new Date(run.createdAt).toLocaleString('vi-VN')} · {stats.total} job</small></div>
                        <div className="runTopRight"><span className={`runStatus status-${run.status.toLowerCase()}`}>{statusLabel(run.status)}</span><b>{stats.progress}%</b></div>
                      </div>
                      <div className="miniProgress"><span style={{ width: `${stats.progress}%` }} /></div>
                      <div className="jobList">
                        {run.publishJobs.map((job) => (
                          <div className={`jobRow ${job.status === 'FAILED' ? 'jobFailed' : ''}`} key={job.id}>
                            <div className="jobMain">
                              <div className="jobTitleLine"><b>{job.target?.name ?? 'Target'}</b><em className={job.target?.mode === 'API' ? 'apiTag' : 'manualTag'}>{job.target?.mode === 'API' ? 'API' : 'XÁC NHẬN'}</em></div>
                              <small>{job.contentVariant?.title || 'Không có tiêu đề'} · {shortId(job.id)}</small>
                              {job.error && <p className="jobError">{job.error}</p>}
                            </div>
                            <div className="jobActions">
                              <span className={`jobStatus status-${job.status.toLowerCase()}`}>{statusLabel(job.status)}</span>
                              {job.status === 'FAILED' && <button className="retryButton" disabled={retryingJobId === job.id} onClick={() => void retryJob(run.id, job.id)}>{retryingJobId === job.id ? 'Đang thử lại…' : '↻ Chạy lại'}</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
                {!campaign.runs.length && <div className="emptyRow largeEmpty">Chưa có run nào. Bấm “Dry Run mới” để chạy thử toàn bộ luồng.</div>}
              </section>
            )}
          </>
        )}

        {(success || error || result) && (
          <section className={`notice ${error ? 'noticeError' : ''}`}>
            {error || success || (result ? `Dry Run ${result.runId}: ${result.queued} job đã được xếp hàng.` : '')}
          </section>
        )}
      </section>
    </main>
  );
}
