import struct
import zlib
import os
import math

def create_png(width, height, output_path, is_maskable=False):
    raw_data = bytearray()
    cx, cy = width / 2.0, height / 2.0

    # Color definitions
    # Brand blue: #2563eb -> (37, 99, 235)
    # Darker blue: #1d4ed8 -> (29, 78, 216)
    # Pure white: #ffffff -> (255, 255, 255)
    
    pad = width * 0.08 if not is_maskable else 0
    corner_r = width * 0.22 if not is_maskable else 0

    for y in range(height):
        raw_data.append(0)  # Filter byte None
        for x in range(width):
            dx = x - cx
            dy = y - cy
            dist = math.hypot(dx, dy)

            # Check if inside card bounds (for non-maskable icons)
            if not is_maskable:
                in_rect = (pad <= x <= width - pad) and (pad <= y <= height - pad)
                is_inside = True
                if x < pad + corner_r and y < pad + corner_r:
                    if math.hypot(x - (pad + corner_r), y - (pad + corner_r)) > corner_r:
                        is_inside = False
                elif x > width - pad - corner_r and y < pad + corner_r:
                    if math.hypot(x - (width - pad - corner_r), y - (pad + corner_r)) > corner_r:
                        is_inside = False
                elif x < pad + corner_r and y > height - pad - corner_r:
                    if math.hypot(x - (pad + corner_r), y - (height - pad - corner_r)) > corner_r:
                        is_inside = False
                elif x > width - pad - corner_r and y > height - pad - corner_r:
                    if math.hypot(x - (width - pad - corner_r), y - (height - pad - corner_r)) > corner_r:
                        is_inside = False
                elif not in_rect:
                    is_inside = False

                if not is_inside:
                    raw_data.extend([0, 0, 0, 0])
                    continue

            # Central Iconography: Gear & Wrench emblem in Safe Zone
            # Scale factor for safe zone:
            scale = 0.7 if is_maskable else 0.85
            s_dist = dist / scale

            # Gear ring
            in_gear_ring = (width * 0.16 <= s_dist <= width * 0.32)
            in_gear_hole = (s_dist < width * 0.12)
            
            # Wrench diagonal arms
            bar1 = abs(dx - dy) < width * 0.045 * scale and s_dist < width * 0.33
            bar2 = abs(dx + dy) < width * 0.045 * scale and s_dist < width * 0.33

            # Gear teeth (8 teeth)
            angle = math.atan2(dy, dx)
            teeth_match = (abs(math.cos(angle * 4)) > 0.65) and (width * 0.28 <= s_dist <= width * 0.36)

            if ((in_gear_ring or teeth_match) and not in_gear_hole) or bar1 or bar2:
                # White icon foreground
                raw_data.extend([255, 255, 255, 255])
            elif in_gear_hole:
                # Center accent circle
                raw_data.extend([29, 78, 216, 255])
            else:
                # Full bleed brand blue background
                raw_data.extend([37, 99, 235, 255])

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw_data), 9))
    png += chunk(b'IEND', b'')

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'wb') as f:
        f.write(png)

create_png(192, 192, 'public/pwa-192x192.png', is_maskable=False)
create_png(512, 512, 'public/pwa-512x512.png', is_maskable=False)
create_png(512, 512, 'public/pwa-maskable-512x512.png', is_maskable=True)
create_png(180, 180, 'public/apple-touch-icon.png', is_maskable=False)
print("PWA PNG icons generated successfully!")
