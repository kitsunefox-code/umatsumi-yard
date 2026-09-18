# -*- coding: utf-8 -*-
# シーズン簿(144日)の予約時刻＝人が決めた答え。そこから「決め方の癖」を数える。
import io, json, os, unicodedata, collections, statistics as st, itertools

ROOT = r"C:\Users\shadai15\Desktop\Claude\個人\ゲーム\umazumi-yard"
d = json.load(io.open(os.path.join(ROOT, 'tools', 'season2026.json'), encoding='utf-8'))
N = lambda s: unicodedata.normalize('NFKC', s or '').strip().upper()

def tmin(t):
    if not t: return None
    try:
        h, m = t.split(':'); return int(h) * 60 + int(m)
    except Exception:
        return None
def fmt(m): return f"{m//60}:{m%60:02d}"

# 担当(26/7/24)と馬房座標
GROOM = dict(SAO='原', ISB='山崎', SIS='赤星', DFO='星', NDL='永宮', EFO='永宮', SVR='謙至', KZN='筒井', CON='筒井',
             REY='遠藤', MAU='祐輔', KBL='松田', STN='祐輔', DDC='一幸', EPN='東家', LDK='祐輔', AMS='山崎', BOP='瑞音',
             GDG='遠藤', HRC='瑞音', SMR='一幸', CRS='赤星', EQX='永宮', LVL='謙至', SHY='原', ORF='謙至', POE='原',
             SCW='瑞音', DKG='赤星', RSP='東家')
POS = dict(SAO=(11,5,4), ISB=(15,5,4), SIS=(19,5,4), DFO=(24,9,3), NDL=(29,9,3), EFO=(24,15,3), SVR=(29,15,3),
           KZN=(10,24,1), CON=(14,24,1), REY=(18,24,1), MAU=(30,24,1), KBL=(10,30,1), STN=(14,30,1), DDC=(18,30,1),
           EPN=(22,30,1), LDK=(30,30,1), AMS=(3,39,2), BOP=(8,39,2), GDG=(3,43,2), HRC=(8,43,2), SMR=(3,47,2),
           CRS=(8,47,2), EQX=(3,51,2), LVL=(3,55,2), SHY=(8,55,2), ORF=(3,59,2), POE=(26,47,5), SCW=(22,53,5),
           DKG=(26,53,5), RSP=(30,53,5))
def adjacent(a, b):
    if a not in POS or b not in POS or a == b: return False
    (c1, r1, b1), (c2, r2, b2) = POS[a], POS[b]
    return b1 == b2 and abs(c1 - c2) <= 5 and abs(r1 - r2) <= 6

out = []
P = out.append
SESS = ['8:00', '13:00', '17:00']

tot = timed = 0
sess_size = collections.defaultdict(list)
first_time = collections.defaultdict(collections.Counter)
slot_occ = collections.Counter()           # 同じ時刻に何頭入れているか
step = collections.Counter()               # 時刻の刻み(分の端数)
rank_by_code = collections.defaultdict(list)   # セッション内の早さ(0=最初,1=最後)
off_by_code = collections.defaultdict(list)    # セッション最初の時刻からの分
ldk_first = [0, 0]
same_slot_pairs = 0; groom_clash = 0; stall_clash = 0
adj_slot_pairs = 0; groom_clash_adj = 0; stall_clash_adj = 0
gap_same_sire = []                         # 同じ種牡馬の朝→昼、昼→夕の間隔
note_rank = collections.defaultdict(list)
span = collections.defaultdict(list)       # セッションの最初〜最後の幅
per_slot_rate = collections.defaultdict(list)

for day, g in d.items():
    times_by_code = collections.defaultdict(list)
    for s in SESS:
        ents = g.get(s, [])
        if not ents: continue
        sess_size[s].append(len(ents))
        tot += len(ents)
        te = [(tmin(e['apptTime']), N(e['sireCode']), e) for e in ents if tmin(e.get('apptTime'))]
        timed += len(te)
        if len(te) < 3: continue
        ts = sorted(t for t, _, _ in te)
        t0, t1 = ts[0], ts[-1]
        first_time[s][fmt(t0)] += 1
        span[s].append(t1 - t0)
        if t1 > t0: per_slot_rate[s].append(len(te) / ((t1 - t0) / 15 + 1))
        for t, c, e in te:
            step[t % 15] += 1
            r = (t - t0) / (t1 - t0) if t1 > t0 else 0
            rank_by_code[c].append(r); off_by_code[c].append(t - t0)
            times_by_code[c].append((s, t))
            nt = e.get('note') or ''
            if '上り再発' in nt: note_rank['上り再発'].append(r)
            elif '上り' in nt: note_rank['上り'].append(r)
            if 'OV' in nt.upper(): note_rank['OV'].append(r)
            if e.get('kind') in ('新', '再'): note_rank['kind:' + e['kind']].append(r)
        if any(c == 'LDK' for _, c, _ in te):
            ldk_first[1] += 1
            if min(t for t, c, _ in te if c == 'LDK') == t0: ldk_first[0] += 1
        by_t = collections.defaultdict(list)
        for t, c, _ in te: by_t[t].append(c)
        for t, cs in by_t.items():
            slot_occ[len(cs)] += 1
            for a, b in itertools.combinations(cs, 2):
                same_slot_pairs += 1
                if GROOM.get(a) and GROOM.get(a) == GROOM.get(b): groom_clash += 1
                if adjacent(a, b): stall_clash += 1
        keys = sorted(by_t)
        for i in range(len(keys) - 1):
            if keys[i + 1] - keys[i] == 15:
                for a in by_t[keys[i]]:
                    for b in by_t[keys[i + 1]]:
                        adj_slot_pairs += 1
                        if GROOM.get(a) and GROOM.get(a) == GROOM.get(b): groom_clash_adj += 1
                        if adjacent(a, b): stall_clash_adj += 1
    for c, lst in times_by_code.items():
        lst.sort(key=lambda x: x[1])
        for (s1, a), (s2, b) in zip(lst, lst[1:]):
            if s1 != s2: gap_same_sire.append(b - a)

P(f"日数={len(d)}  のべ={tot}頭  時刻あり={timed}頭 ({timed/tot*100:.0f}%)")
for s in SESS:
    if sess_size[s]:
        P(f"[{s}] 開催={len(sess_size[s])}日  頭数 中央値={st.median(sess_size[s]):.0f} 最大={max(sess_size[s])}  "
          f"最初の時刻={first_time[s].most_common(4)}  最初〜最後の幅 中央値={st.median(span[s]) if span[s] else 0:.0f}分  "
          f"15分あたり頭数 中央値={st.median(per_slot_rate[s]) if per_slot_rate[s] else 0:.2f}")
P(f"時刻の端数(分): {dict(step)}")
P(f"同じ時刻に入れる頭数の分布: {dict(sorted(slot_occ.items()))}")
P(f"LDKがその組の最初の時刻: {ldk_first[0]}/{ldk_first[1]} ({ldk_first[0]/max(1,ldk_first[1])*100:.0f}%)")
P(f"同時刻ペア={same_slot_pairs}  うち担当が同じ={groom_clash} ({groom_clash/max(1,same_slot_pairs)*100:.1f}%)  馬房が隣接={stall_clash} ({stall_clash/max(1,same_slot_pairs)*100:.1f}%)")
P(f"15分違いペア={adj_slot_pairs}  うち担当が同じ={groom_clash_adj} ({groom_clash_adj/max(1,adj_slot_pairs)*100:.1f}%)  馬房が隣接={stall_clash_adj} ({stall_clash_adj/max(1,adj_slot_pairs)*100:.1f}%)")
# 偶然ならどのくらい被るか（同じ組の全ペアでの基準率）
base_pairs = base_g = base_s = 0
for day, g in d.items():
    for s in SESS:
        cs = [N(e['sireCode']) for e in g.get(s, [])]
        for a, b in itertools.combinations(cs, 2):
            base_pairs += 1
            if GROOM.get(a) and GROOM.get(a) == GROOM.get(b): base_g += 1
            if adjacent(a, b): base_s += 1
P(f"(基準) 同じ組の全ペアで 担当同じ={base_g/base_pairs*100:.1f}%  馬房隣接={base_s/base_pairs*100:.1f}%")
if gap_same_sire:
    gs = sorted(gap_same_sire)
    P(f"同じ種牡馬の組またぎ間隔: n={len(gs)} 最小={gs[0]}分 5%点={gs[len(gs)//20]}分 中央値={st.median(gs):.0f}分  4時間未満={sum(1 for x in gs if x<240)}件")
P("注記・新再ごとの早さ(0=最初 1=最後): " + ", ".join(f"{k}: 平均{st.mean(v):.2f} (n={len(v)})" for k, v in sorted(note_rank.items())))
P("")
P("種牡馬ごとの早さ(0=最初 1=最後) と 組の最初の時刻からの分:")
rows = [(st.mean(v), c, len(v), st.pstdev(v), st.median(off_by_code[c])) for c, v in rank_by_code.items() if len(v) >= 15]
for m, c, n, sd, off in sorted(rows):
    P(f"  {c:4s} 平均{m:.2f} ばらつき{sd:.2f}  最初から中央値{off:>4.0f}分  n={n}  担当={GROOM.get(c,'?')}")

io.open(os.path.join(os.path.dirname(__file__), 'analyze_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
