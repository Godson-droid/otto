#!/usr/bin/env python3
"""Assemble the Otto demo video: stills + zoompan + narration + burned captions.
Mirrors the Reflex production pattern (script first, per scene TTS, sentence
level captions proportional to word count)."""
import subprocess, os, sys

DEMO = '/home/hatch/workspace/aevum-build/otto/demo'
SHOTS = f'{DEMO}/shots'
AUD = f'{DEMO}/audio'
WORK = f'{DEMO}/work/build'
os.makedirs(WORK, exist_ok=True)
FPS = 30

def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        print(r.stdout[-2000:]); print(r.stderr[-3000:]); sys.exit(1)
    return r

def dur(path):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                   '-of', 'csv=p=0', path])
    return float(out)

segs = ['s1', 's2', 's3', 's4', 's5', 's6', 's7']
durs = {s: dur(f'{AUD}/{s}.mp3') for s in segs}
print('segment durations:', {k: round(v, 2) for k, v in durs.items()})

GAP = 0.6
TAIL = 5.0
starts, t = {}, 0.0
for s in segs:
    starts[s] = t
    t += durs[s] + GAP
TOTAL = t - GAP + TAIL
print('scene starts:', {k: round(v, 2) for k, v in starts.items()}, 'total', round(TOTAL, 2))

# ---------- audio track ----------
concat_list = []
for i, s in enumerate(segs):
    wav = f'{WORK}/{s}.wav'
    run(['ffmpeg', '-y', '-v', 'error', '-i', f'{AUD}/{s}.mp3', '-ar', '48000', '-ac', '1', wav])
    concat_list.append(wav)
    if s != segs[-1]:
        gw = f'{WORK}/gap{i}.wav'
        run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', str(GAP), gw])
        concat_list.append(gw)
tailw = f'{WORK}/tail.wav'
run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', str(TAIL), tailw])
concat_list.append(tailw)
with open(f'{WORK}/audio-concat.txt', 'w') as f:
    for p in concat_list:
        f.write(f"file '{p}'\n")
run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{WORK}/audio-concat.txt',
     '-c:a', 'pcm_s16le', f'{WORK}/narration.wav'])

# ---------- subtitles ----------
SENTENCES = {
 's1': ["Freelancers and small merchants are starting to bill in stablecoins.",
        "But the checkout most teams build on has a dangerous flaw: anyone can pay any amount on any order, and the order is marked paid.",
        "Otto fixes that.",
        "This is Otto, live on the Aevum testnet."],
 's2': ["Every Otto bill is a signed quote.",
        "The seller signs the invoice, the buyer's address, the exact amount and an expiry.",
        "The contract checks all four before a single coin moves.",
        "Pay the wrong amount, pay late, or pay from the wrong wallet, and the payment is rejected.",
        "There is no paid flag to fool."],
 's3': ["Requesting a payment takes seconds.",
        "The seller enters the amount and the buyer's address, signs once, and shares a link or a scan code.",
        "The link carries everything the buyer needs, and the amount on it cannot be changed by anyone."],
 's4': ["The buyer does not even need the gas token.",
        "They sign an authorisation on the token itself, a relayer sends it, and the contract records the exact amount.",
        "This invoice was paid just now, while filming, through this page."],
 's5': ["Otto also lets an AI agent pay bills for you, inside strict limits.",
        "The owner sets a total cap, a cap per payment, an approved list of payees and an expiry, and can revoke the budget at any moment.",
        "The agent's money never sits in the budget contract.",
        "It moves only when every limit passes."],
 's6': ["And the limits bite.",
        "An agent payment of half a tUSD8 sat inside its budget and settled.",
        "But when a payment of one tUSD8 broke the per payment cap of nought point seven five, the chain itself refused it.",
        "Nothing settled, and the budget was untouched."],
 's7': ["Otto is open source, with sixty eight passing tests, and every flow you have seen is live on the Aevum testnet, ready to check on the explorer.",
        "Otto.",
        "Exact bills, paid exactly.",
        "Built for the Aevum Builder Challenge."],
}

def ts(x):
    h = int(x // 3600); m = int((x % 3600) // 60); s = int(x % 60); ms = int(round((x - int(x)) * 1000))
    if ms == 1000: s += 1; ms = 0
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

srt = []
idx = 1
for s in segs:
    start = starts[s]; total = durs[s]
    words = [max(1, len(x.split())) for x in SENTENCES[s]]
    wsum = sum(words)
    cur = start
    for sent, w in zip(SENTENCES[s], words):
        d = total * w / wsum
        srt.append(f'{idx}\n{ts(cur)} --> {ts(cur + d)}\n{sent}\n')
        idx += 1
        cur += d
with open(f'{WORK}/subs.srt', 'w') as f:
    f.write('\n'.join(srt))
with open(f'{DEMO}/otto-demo.srt', 'w') as f:
    f.write('\n'.join(srt))
print('srt cues:', idx - 1)

# ---------- video segments ----------
def seglen(s):
    return durs[s] + GAP

s7a = round(durs['s7'] * 0.55, 2)
s7b = round(durs['s7'] - s7a + TAIL, 2)
plan = [
    ('v1-dashboard.png',        seglen('s1'), 'in'),
    ('v2-invoice-waiting.png',  seglen('s2'), 'in'),
    ('v3-request.png',          seglen('s3'), 'in'),
    ('v4-invoice-paid.png',     seglen('s4'), 'in'),
    ('v5-budget.png',           seglen('s5'), 'in'),
    ('v6-explorer-refused.png', seglen('s6'), 'in'),
    ('v7-explorer-settle.png',  s7a,          'in'),
    ('v8-endcard.png',          s7b,          'out'),
]
segfiles = []
for i, (img, d, mode) in enumerate(plan):
    frames = max(1, round(d * FPS))
    if mode == 'in':
        z = f"1+0.06*on/{max(1, frames - 1)}"
    else:
        z = f"1.06-0.06*on/{max(1, frames - 1)}"
    out = f'{WORK}/vseg{i:02d}.mp4'
    vf = (f"scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,"
          f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1920x1080:fps={FPS},"
          f"fade=t=in:st=0:d=0.4,fade=t=out:st={max(0, d - 0.4):.2f}:d=0.4,format=yuv420p")
    run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-i', f'{SHOTS}/{img}', '-vf', vf,
         '-t', str(d), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', out])
    segfiles.append(out)
    print('segment', i, img, round(d, 2), 's')

with open(f'{WORK}/video-concat.txt', 'w') as f:
    for p in segfiles:
        f.write(f"file '{p}'\n")
run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{WORK}/video-concat.txt',
     '-c', 'copy', f'{WORK}/video.mp4'])

# ---------- final mux with burned captions ----------
run(['ffmpeg', '-y', '-v', 'error', '-i', f'{WORK}/video.mp4', '-i', f'{WORK}/narration.wav',
     '-vf', f"subtitles={WORK}/subs.srt:force_style='FontName=DejaVu Sans,FontSize=19,PrimaryColour=&HFFFFFF,OutlineColour=&H90000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=2,MarginV=36'",
     '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '128k',
     '-shortest', f'{DEMO}/otto-demo.mp4'])
print('final duration:', round(dur(f'{DEMO}/otto-demo.mp4'), 2))
print('DONE')
