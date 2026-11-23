"""Package generated strips into square cells without stretching or changing alpha.

Usage: python scripts/prepare-login-gym-assets.py output/login-gym/sources.json
Manifest: {"gym-floor": {"source": "..."}, "p-runner-1": {"source": "...", "frames": 6}, ...}
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / "output" / "login-gym"
PUBLIC = ROOT / "g-fitness-admin" / "public" / "art" / "login-gym"


def prepare(manifest_path):
    sources = json.loads(Path(manifest_path).read_text(encoding="utf-8-sig"))
    EXPORT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for name, spec in sources.items():
        image = Image.open(spec["source"])
        if name == "gym-floor":
            result = image.convert("RGB").resize((2400, 1350), Image.Resampling.LANCZOS)
        else:
            image = image.convert("RGBA")
            assert image.getchannel("A").getextrema() == (0, 255), f"{name}: missing transparency"
            frames = spec["frames"]
            result = Image.new("RGBA", (frames * 512, 512))
            # Some generators export a wider cell height than width. Contain each
            # complete frame in a square, keeping its original camera and scale.
            for i in range(frames):
                frame = image.crop((round(i * image.width / frames), 0,
                                    round((i + 1) * image.width / frames), image.height))
                frame.thumbnail((512, 512), Image.Resampling.LANCZOS)
                result.paste(frame, (i * 512 + (512 - frame.width) // 2,
                                     (512 - frame.height) // 2))
        result.save(EXPORT / f"{name}.png")
        result.save(PUBLIC / f"{name}.webp", quality=88, method=6)
        print(f"{name}: {result.width} x {result.height}, {result.mode}")


if __name__ == "__main__":
    prepare(sys.argv[1])
