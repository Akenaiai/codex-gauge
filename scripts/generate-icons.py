"""Regenerate original gauge icons (development only: Pillow required)."""
from pathlib import Path
from PIL import Image, ImageDraw
import math

root = Path(__file__).resolve().parents[1] / 'assets'
root.mkdir(exist_ok=True)
im = Image.new('RGBA', (1024, 1024))
d = ImageDraw.Draw(im)
d.rounded_rectangle((20, 20, 1004, 1004), radius=232, fill='#191c1f', outline='#343b3e', width=12)
d.arc((170, 170, 854, 854), 135, 405, fill='#3c4549', width=28)
d.arc((170, 170, 854, 854), 135, 341, fill='#dfb878', width=28)
d.arc((245, 245, 779, 779), 135, 259, fill='#83bab6', width=13)
for i in range(21):
    angle = math.radians(135 + i * 13.5)
    inner = 374 if i % 5 else 365
    outer = 401
    d.line((512 + inner*math.cos(angle), 512 + inner*math.sin(angle), 512 + outer*math.cos(angle), 512 + outer*math.sin(angle)), fill='#a7aaa3', width=7)
angle = math.radians(320)
d.line((512, 512, 512 + 195*math.cos(angle), 512 + 195*math.sin(angle)), fill='#dfb878', width=28)
d.ellipse((481, 481, 543, 543), fill='#dfb878')
d.rounded_rectangle((448, 736, 576, 758), radius=11, fill='#83bab6')
im.resize((512,512), Image.Resampling.LANCZOS).save(root / 'icon.png')
im.save(root / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
im.resize((32,32), Image.Resampling.LANCZOS).save(root / 'tray.png')
