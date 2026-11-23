#!/bin/sh
# Each video is its own HyperFrames project; the shared piece styles live once in assets/.
for d in owner desk coach member checkin workout progress bookings assistant renewal; do [ -d "$d" ] && mkdir -p "$d/assets" && cp assets/pieces.css assets/qr.svg assets/kit.js "$d/assets/"; done
