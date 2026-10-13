'use client';

import { useState } from 'react';

type RunResult = {
  campaignId: string;
  queued: number;
  apiTargets: number;
  manualTargets: number;
  status: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

const targets = [
  { id: 'facebook-page-hola', mode: 'API' },
  { id: 'facebook-page-kthl', mode: 'API' },
  { id: 'community-group-demo', mode: 'MANUAL_CONFIRMATION' },
] as const;

export default function HomePage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');

  async function runCampaign() {
    setRunning(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/campaigns/hola-halo/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });

      if (!response.ok) throw new Error(`API trả về ${response.status}`);
      setResult(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể chạy chiến dịch');
    } finally {
      setRunning(false);
    }
  }

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
        <div className="sidebarFoot">MVP · v0.1.0</div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">TRUNG TÂM CHIẾN DỊCH</p><h1>Hola Halo · Nhìn Hòa Lạc</h1></div>
          <span className="status"><i /> Sẵn sàng</span>
        </header>

        <section className="heroCard">
          <div>
            <span className="pill">CHIẾN DỊCH MẪU</span>
            <h2>Một nút để đưa toàn bộ tác vụ vào hàng đợi.</h2>
            <p>API xử lý các kênh đã được cấp quyền. Những điểm cần thao tác người dùng sẽ tự chuyển sang hàng chờ xác nhận.</p>
          </div>
          <button className="runButton" onClick={runCampaign} disabled={running}>
            {running ? 'ĐANG XẾP HÀNG…' : '▶  CHẠY CHIẾN DỊCH'}
          </button>
        </section>

        <section className="metrics">
          <article><span>Điểm phân phối</span><strong>3</strong><small>2 API · 1 xác nhận</small></article>
          <article><span>Biến thể nội dung</span><strong>12</strong><small>Sẵn sàng để gán</small></article>
          <article><span>Hàng đợi</span><strong>{result?.queued ?? 0}</strong><small>{result ? result.status : 'Chưa chạy'}</small></article>
          <article><span>Worker</span><strong>01</strong><small>BullMQ / Redis</small></article>
        </section>

        <section className="panel">
          <div className="panelHead"><div><p className="eyebrow">PHÂN PHỐI</p><h3>Danh sách tác vụ mẫu</h3></div><span>campaign-distribution</span></div>
          <div className="targetRow"><div><b>Facebook Page · Hola</b><small>facebook-page-hola</small></div><em className="apiTag">API</em></div>
          <div className="targetRow"><div><b>Facebook Page · KTHL</b><small>facebook-page-kthl</small></div><em className="apiTag">API</em></div>
          <div className="targetRow"><div><b>Community Group · Demo</b><small>community-group-demo</small></div><em className="manualTag">XÁC NHẬN</em></div>
        </section>

        {(result || error) && (
          <section className={`notice ${error ? 'noticeError' : ''}`}>
            {error ? error : `Đã đưa ${result?.queued} tác vụ vào queue: ${result?.apiTargets} API, ${result?.manualTargets} cần xác nhận.`}
          </section>
        )}
      </section>
    </main>
  );
}
