'use client';

import { useCallback, useEffect, useState } from 'react';

type CampaignSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count: { contentVariants: number; targets: number; runs: number };
  runs: Array<{ id: string; status: string; createdAt: string }>;
};

type CampaignDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  contentVariants: Array<{ id: string; title: string | null; body: string; mediaUrl: string | null }>;
  targets: Array<{
    id: string;
    name: string;
    externalId: string | null;
    type: string;
    mode: 'API' | 'MANUAL_CONFIRMATION';
    active: boolean;
  }>;
  runs: Array<{
    id: string;
    status: string;
    publishJobs: Array<{ id: string; status: string }>;
  }>;
};

type RunResult = {
  campaignId: string;
  runId: string;
  queued: number;
  apiTargets: number;
  manualTargets: number;
  status: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export default function HomePage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setError('');
    const response = await fetch(`${API_BASE}/campaigns`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Không tải được chiến dịch (${response.status})`);

    const list = (await response.json()) as CampaignSummary[];
    setCampaigns(list);

    if (!list.length) {
      setCampaign(null);
      return;
    }

    const detailResponse = await fetch(`${API_BASE}/campaigns/${list[0].id}`, { cache: 'no-store' });
    if (!detailResponse.ok) throw new Error(`Không tải được chi tiết (${detailResponse.status})`);
    setCampaign((await detailResponse.json()) as CampaignDetail);
  }, []);

  useEffect(() => {
    loadDashboard()
      .catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
      .finally(() => setLoading(false));
  }, [loadDashboard]);

  async function bootstrapDemo() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/campaigns/bootstrap-demo`, { method: 'POST' });
      if (!response.ok) throw new Error(`Không thể tạo dữ liệu mẫu (${response.status})`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo dữ liệu mẫu');
    } finally {
      setLoading(false);
    }
  }

  async function runCampaign() {
    if (!campaign) return;
    setRunning(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/campaigns/${campaign.id}/run`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `API trả về ${response.status}`);
      }
      setResult((await response.json()) as RunResult);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể chạy chiến dịch');
    } finally {
      setRunning(false);
    }
  }

  const latestRun = campaign?.runs[0];
  const activeTargets = campaign?.targets.filter((target) => target.active) ?? [];
  const apiTargets = activeTargets.filter((target) => target.mode === 'API').length;
  const manualTargets = activeTargets.length - apiTargets;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">A</span><div><strong>AutoSpace</strong><small>Campaign Hub</small></div></div>
        <nav>
          <a className="active">Tổng quan</a>
          <a>Chiến dịch</a>
          <a>Nội dung</a>
          <a>Kênh phân phối</a>
          <a>Hàng đợi</a>
          <a>Kết quả</a>
        </nav>
        <div className="sidebarFoot">MVP · v0.2.0</div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TRUNG TÂM CHIẾN DỊCH</p>
            <h1>{campaign?.name ?? 'AutoSpace Campaign Hub'}</h1>
          </div>
          <span className="status"><i /> {loading ? 'Đang tải' : campaign?.status ?? 'Chưa có chiến dịch'}</span>
        </header>

        {!campaign ? (
          <section className="heroCard">
            <div>
              <span className="pill">KHỞI TẠO DATABASE</span>
              <h2>Tạo chiến dịch Hola Halo đầu tiên bằng dữ liệu thật.</h2>
              <p>API sẽ tạo campaign, hai content variant và ba target mẫu trong PostgreSQL. Sau đó toàn bộ dashboard đọc trực tiếp từ database.</p>
            </div>
            <button className="runButton" onClick={bootstrapDemo} disabled={loading}>
              {loading ? 'ĐANG KHỞI TẠO…' : '＋ TẠO HOLA HALO'}
            </button>
          </section>
        ) : (
          <>
            <section className="heroCard">
              <div>
                <span className="pill">{campaign.slug.toUpperCase()}</span>
                <h2>Một nút tạo Campaign Run và lưu từng Publish Job.</h2>
                <p>Mỗi target được gán một content variant, ghi vào PostgreSQL rồi đưa sang BullMQ. Worker cập nhật trạng thái trở lại database.</p>
              </div>
              <button className="runButton" onClick={runCampaign} disabled={running || !activeTargets.length}>
                {running ? 'ĐANG XẾP HÀNG…' : '▶  CHẠY CHIẾN DỊCH'}
              </button>
            </section>

            <section className="metrics">
              <article><span>Điểm phân phối</span><strong>{activeTargets.length}</strong><small>{apiTargets} API · {manualTargets} xác nhận</small></article>
              <article><span>Biến thể nội dung</span><strong>{campaign.contentVariants.length}</strong><small>Đang lưu trong PostgreSQL</small></article>
              <article><span>Run gần nhất</span><strong>{latestRun?.publishJobs.length ?? 0}</strong><small>{latestRun?.status ?? 'Chưa chạy'}</small></article>
              <article><span>Tổng chiến dịch</span><strong>{campaigns.length}</strong><small>Dữ liệu thật từ API</small></article>
            </section>

            <section className="panel">
              <div className="panelHead"><div><p className="eyebrow">PHÂN PHỐI</p><h3>Target đang hoạt động</h3></div><span>campaign-distribution</span></div>
              {activeTargets.map((target) => (
                <div className="targetRow" key={target.id}>
                  <div><b>{target.name}</b><small>{target.externalId ?? target.type}</small></div>
                  <em className={target.mode === 'API' ? 'apiTag' : 'manualTag'}>
                    {target.mode === 'API' ? 'API' : 'XÁC NHẬN'}
                  </em>
                </div>
              ))}
            </section>
          </>
        )}

        {(result || error) && (
          <section className={`notice ${error ? 'noticeError' : ''}`}>
            {error
              ? error
              : `Run ${result?.runId}: đã đưa ${result?.queued} job vào queue (${result?.apiTargets} API, ${result?.manualTargets} xác nhận).`}
          </section>
        )}
      </section>
    </main>
  );
}
