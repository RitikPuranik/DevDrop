import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { analyticsAPI } from '../../api/analytics';
import './ActivityHeatmap.css';

const LEVELS = ['#202329', '#343943', '#565d68', '#8a909a', '#d7dbe0'];
const keyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const duration = (minutes = 0) => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  return total >= 60 ? `${Math.floor(total / 60)}h ${total % 60}m` : `${total}m`;
};

function createCalendar(records, days) {
  const map = new Map(records.map((item) => [item.date, item]));
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const start = new Date(today); start.setDate(today.getDate() - days + 1);
  const gridStart = new Date(start); gridStart.setDate(start.getDate() - start.getDay());
  const gridEnd = new Date(today); gridEnd.setDate(today.getDate() + 6 - today.getDay());
  const weeks = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 7)) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(cursor); date.setDate(cursor.getDate() + i);
      const dateKey = keyOf(date);
      week.push({ ...(map.get(dateKey) || {}), date: dateKey, dateObject: date, inRange: date >= start && date <= today });
    }
    weeks.push(week);
  }
  const months = [];
  let last = '';
  weeks.forEach((week, index) => {
    const day = week.find((item) => item.inRange);
    if (day) {
      const month = day.dateObject.toLocaleDateString(undefined, { month: 'short' });
      if (month !== last) { months.push({ index, month }); last = month; }
    }
  });
  return { weeks, months };
}

export default function ActivityHeatmap() {
  const [mode, setMode] = useState('buying');
  const [days, setDays] = useState(365);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await analyticsAPI.getActivityHeatmap(days);
      setRecords(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      // Keep the heatmap visible even when analytics is temporarily unavailable.
      setRecords([]);
    } finally { setLoading(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const field = mode === 'buying' ? 'buyingMinutes' : 'sellingMinutes';
  const max = Math.max(1, ...records.map((item) => Number(item[field]) || 0));
  const total = records.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
  const { weeks, months } = useMemo(() => createCalendar(records, days), [records, days]);
  const picked = records.find((item) => item.date === selected);

  return (
    <section className="activity-map w-full overflow-hidden rounded-2xl border border-white/[0.09] bg-black text-[#e9e9ec] shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-5">
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.09] bg-[#0b0c0f] p-1">
          {['buying', 'selling'].map((item) => <button key={item} type="button" onClick={() => { setMode(item); setSelected(''); }} aria-pressed={mode === item} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${mode === item ? 'bg-[#d7dbe0] text-[#101216]' : 'text-white/55 hover:text-white'}`}>{item}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(event) => { setDays(Number(event.target.value)); setSelected(''); }} aria-label="Date range" className="rounded-lg border border-white/[0.1] bg-[#0b0c0f] px-3 py-2 text-xs text-white/75 outline-none focus:border-white/30">
            <option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>1 year</option>
          </select>
          <button type="button" onClick={load} aria-label="Refresh heatmap" title="Refresh" className="rounded-lg border border-white/[0.1] bg-[#0b0c0f] p-2 text-white/60 transition hover:text-white"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-white/85">{duration(total)}</span>
          <div className="flex items-center gap-1.5 text-[10px] text-white/45"><span>Less</span>{LEVELS.map((color, index) => <span key={color} className="h-2.5 w-2.5 rounded-[3px] border border-white/[0.06]" style={{ backgroundColor: color }} title={`Level ${index}`} />)}<span>More</span></div>
        </div>
        <div className="overflow-x-auto pb-1">
            <div className="min-w-max">
              <div className="mb-2 grid gap-[3px] text-[10px] text-white/35" style={{ gridTemplateColumns: `26px repeat(${weeks.length}, 12px)` }}><span />{weeks.map((week, index) => <span key={index} className="h-3">{months.find((item) => item.index === index)?.month || ''}</span>)}</div>
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `26px repeat(${weeks.length}, 12px)` }}>
                <div className="grid grid-rows-7 gap-[3px] text-[9px] text-white/35"><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
                {weeks.map((week, wi) => <div key={wi} className="grid grid-rows-7 gap-[3px]">{week.map((day) => {
                  const minutes = Number(day[field]) || 0;
                  const level = minutes ? Math.min(4, Math.max(1, Math.ceil(minutes / max * 4))) : 0;
                  const label = day.dateObject.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                  return <button key={day.date} type="button" disabled={!day.inRange} onClick={() => setSelected(day.date)} title={`${label}: ${duration(minutes)}`} aria-label={`${label}: ${duration(minutes)} ${mode}`} aria-pressed={selected === day.date} className={`heatmap-cell h-3 w-3 rounded-[3px] border transition focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${day.inRange ? 'border-white/[0.04]' : 'border-transparent opacity-20'} ${selected === day.date ? 'outline outline-1 outline-white/40 outline-offset-1' : ''}`} style={{ backgroundColor: LEVELS[level] }} />;
                })}</div>)}
              </div>
            </div>
          </div>
        {picked && !loading && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3 text-xs"><span className="text-white/55">{new Date(`${picked.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span><span className="text-white/80">Buy {duration(picked.buyingMinutes)} <span className="mx-1 text-white/20">/</span> Sell {duration(picked.sellingMinutes)}</span></div>}
      </div>
    </section>
  );
}
