# -*- coding: utf-8 -*-
# 人が決めた呼び時刻を、機械がどこまで再現できるかを過去144日で試す（その日のデータは学習から除く）
import io, json, os, unicodedata, collections, statistics as st

ROOT = r"C:\Users\shadai15\Desktop\Claude\個人\ゲーム\umazumi-yard"
d = json.load(io.open(os.path.join(ROOT, 'tools', 'season2026.json'), encoding='utf-8'))
N = lambda s: unicodedata.normalize('NFKC', s or '').strip().upper()
def tmin(t):
    try:
        h, m = t.split(':'); return int(h) * 60 + int(m)
    except Exception:
        return None
SESS = ['8:00', '13:00', '17:00']
out = []; P = out.append

# ---- セッションを取り出す（時刻は15分に丸める）
sessions = []   # dict(day, s, ents=[(code, t or None, farm, kind, note)], t0)
for day, g in d.items():
    prev = {}
    for s in SESS:
        ents = [(N(e['sireCode']), tmin(e.get('apptTime') or ''), N(e.get('farm')), e.get('kind') or '', e.get('note') or '') for e in g.get(s, [])]
        ents = [(c, (round(t / 15) * 15 if t else None), f, k, n) for c, t, f, k, n in ents]
        timed = [t for _, t, _, _, _ in ents if t]
        if len(timed) >= 6:
            sessions.append(dict(day=day, s=s, ents=ents, t0=min(timed), prev=dict(prev)))
        for c, t, _, _, _ in ents:
            if t: prev[c] = t
P(f"検証に使う組: {len(sessions)}（時刻が6頭以上入っている組）")

# ---- 追加の統計
gaps = collections.Counter(); first_wave = []; untimed_farm = collections.Counter(); timed_farm = collections.Counter()
for S in sessions:
    ts = sorted(set(t for _, t, _, _, _ in S['ents'] if t))
    for a, b in zip(ts, ts[1:]): gaps[b - a] += 1
    first_wave.append(sum(1 for _, t, _, _, _ in S['ents'] if t == S['t0']))
    for c, t, f, k, n in S['ents']:
        key = 'NF/SF等(社内)' if f in ('NF', 'SF', 'ノーザンF', '社台F', '追分F', '白老F', 'NFしがらき', 'NF空港', 'NF早来') or f.startswith('NF') or f.startswith('SF') else '一般牧場'
        (timed_farm if t else untimed_farm)[key] += 1
P(f"呼び時刻どうしの間隔(分): {dict(sorted(gaps.items())[:8])}")
P(f"最初の時刻に呼ぶ頭数: 中央値={st.median(first_wave)} 平均={st.mean(first_wave):.1f} 最大={max(first_wave)}")
for k in set(timed_farm) | set(untimed_farm):
    a, b = timed_farm[k], untimed_farm[k]
    P(f"  {k}: 時刻あり{a} / なし{b}  → 時刻ありの割合 {a/(a+b)*100:.0f}%")

# ---- 学習：種牡馬ごとの「最初の時刻からの分」（その日を除いた中央値）と、呼び込みの累積カーブ
def learn(exclude_day):
    off = collections.defaultdict(list); curve = collections.defaultdict(list)
    for S in sessions:
        if S['day'] == exclude_day: continue
        tt = sorted(t - S['t0'] for _, t, _, _, _ in S['ents'] if t)
        n = len(tt)
        for k in range(0, 181, 15):
            curve[k].append(sum(1 for x in tt if x <= k) / n)
        for c, t, _, _, _ in S['ents']:
            if t: off[c].append(t - S['t0'])
    med = {c: st.mean(v) for c, v in off.items() if len(v) >= 5}
    cur = {k: st.mean(v) for k, v in curve.items()}
    # 早さの割合(0..1)と、頭数ごとの「最初〜最後の幅」
    rk = collections.defaultdict(list); span = collections.defaultdict(list)
    for S in sessions:
        if S['day'] == exclude_day: continue
        tt = [t for _, t, _, _, _ in S['ents'] if t]; a, b = min(tt), max(tt)
        n_all = len(S['ents'])
        span[min(n_all // 4, 6)].append(b - a)
        if b > a:
            for c, t, _, _, _ in S['ents']:
                if t: rk[c].append((t - a) / (b - a))
    rkm = {c: st.mean(v) for c, v in rk.items() if len(v) >= 5}
    spm = {k: st.median(v) for k, v in span.items()}
    # 牧場ごとの残差（種牡馬の早さで説明できない分）
    fr = collections.defaultdict(list)
    for S in sessions:
        if S['day'] == exclude_day: continue
        tt = [t for _, t, _, _, _ in S['ents'] if t]; a, b = min(tt), max(tt)
        if b <= a: continue
        for c, t, f, _, _ in S['ents']:
            if t and c in rkm and f: fr[f].append((t - a) / (b - a) - rkm[c])
    frm = {f: st.mean(v) for f, v in fr.items() if len(v) >= 8}
    return med, cur, rkm, spm, frm

def predict(S, med, cur, mode, rkm=None, spm=None, frm=None):
    ents = [e for e in S['ents'] if e[1]]          # 採点できるのは時刻が入っている馬だけ
    n = len(ents)
    glob = st.mean(med.values())
    order = sorted(range(n), key=lambda i: (0 if ents[i][0] == 'LDK' else 1, med.get(ents[i][0], glob)))
    pred = [None] * n
    if mode == 'offset':        # A: 種牡馬ごとのいつもの時刻をそのまま使う
        for i in range(n):
            pred[i] = S['t0'] + round(med.get(ents[i][0], glob) / 15) * 15
    elif mode == 'curve':       # B: 早い順に並べ、呼び込みカーブに沿って時刻を配る
        ks = sorted(cur)
        for rank, i in enumerate(order):
            need = (rank + 1) / n
            k = next((k for k in ks if cur[k] >= need - 1e-9), ks[-1])
            pred[i] = S['t0'] + k
    elif mode in ('scaled', 'scaled+farm'):   # C/D: 早さの割合 × その頭数なら普通はこの幅
        n_all = len(S['ents'])
        sp = spm.get(min(n_all // 4, 6), 75)
        g = st.mean(rkm.values())
        for i in range(n):
            r = rkm.get(ents[i][0], g)
            if mode == 'scaled+farm': r += frm.get(ents[i][2], 0)
            r = min(1, max(0, r))
            pred[i] = S['t0'] + round(r * sp / 15) * 15
            if ents[i][0] == 'LDK': pred[i] = S['t0']
    elif mode == 'naive':       # 参考: 登録順に2頭ずつ15分刻み（癖を使わない）
        for rank in range(n):
            pred[rank] = S['t0'] + (rank // 2) * 15
    # 4時間ルール（実績の5%点=3時間45分を下限に）
    for i in range(n):
        p = S['prev'].get(ents[i][0])
        if p and pred[i] < p + 225: pred[i] = p + 225
    return [(pred[i], ents[i][1], ents[i][0]) for i in range(n)]

res = collections.defaultdict(list); by_code = collections.defaultdict(list)
cache = {}
for S in sessions:
    if S['day'] not in cache: cache[S['day']] = learn(S['day'])
    med, cur, rkm, spm, frm = cache[S['day']]
    for mode in ('naive', 'offset', 'curve', 'scaled', 'scaled+farm'):
        for p, a, c in predict(S, med, cur, mode, rkm, spm, frm):
            res[mode].append(abs(p - a))
            if mode == 'curve': by_code[c].append(abs(p - a))
P("")
P("人が決めた時刻との差（その日のデータは学習に使わない）:")
for mode, label in (('naive', '参考: 登録順に2頭ずつ'), ('offset', 'A: 種牡馬ごとのいつもの時刻'), ('curve', 'B: 早い順＋呼び込みカーブ'), ('scaled', 'C: 早さの割合×頭数に応じた幅'), ('scaled+farm', 'D: C＋牧場ごとの癖')):
    e = res[mode]; n = len(e)
    P(f"  {label:24s} 平均ずれ {st.mean(e):5.1f}分  ぴったり {sum(1 for x in e if x==0)/n*100:4.0f}%  15分以内 {sum(1 for x in e if x<=15)/n*100:4.0f}%  30分以内 {sum(1 for x in e if x<=30)/n*100:4.0f}%  (n={n})")
P("")
P("B案で外しやすい種牡馬（平均ずれ 大きい順）:")
for c, v in sorted(by_code.items(), key=lambda kv: -st.mean(kv[1]))[:8]:
    P(f"  {c:4s} 平均ずれ {st.mean(v):.0f}分 (n={len(v)})")

io.open(os.path.join(os.path.dirname(__file__), 'backtest_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
