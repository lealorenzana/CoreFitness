#!/bin/sh
# Runs `hyperframes check` on each video and prints its errors and warnings (layout, overflow, contrast).
export HYPERFRAMES_NO_UPDATE_CHECK=1
for v in ${@:-owner desk coach member checkin workout progress bookings assistant renewal}; do
  npx --yes hyperframes@0.9.61 check "$v" > /dev/null 2>&1
  python -c "
import json,glob,os,sys
f=max(glob.glob('$v/.hyperframes/artifacts/checks/*.json'),key=os.path.getmtime)
d=json.load(open(f,encoding='utf8'))
seen=set()
def walk(x):
  if isinstance(x,dict):
    if 'severity' in x:
      k=(x.get('severity'),x.get('code'),str(x.get('message'))[:160])
      if k[0] in('error','warning') and k not in seen: seen.add(k); print('  $v',*k,'|',str(x.get('selector') or x.get('element') or '')[:60])
      return
    for v in x.values(): walk(v)
  elif isinstance(x,list):
    for v in x: walk(v)
walk(d)"
done
