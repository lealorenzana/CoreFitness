#!/bin/sh
# Renders every video to MP4 (H.264) and WebM (VP9), the two sources the site's <video> lists.
export HYPERFRAMES_NO_UPDATE_CHECK=1
sh sync.sh
mkdir -p renders
for v in ${@:-owner desk coach member checkin workout progress bookings assistant renewal}; do
  npx --yes hyperframes@0.9.61 render "$v" -o "renders/roles-$v.mp4" --quality high --quiet || exit 1
  ffmpeg -v error -y -i "renders/roles-$v.mp4" -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -an "renders/roles-$v.webm" || exit 1
done
