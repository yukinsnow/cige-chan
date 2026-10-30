"""Decode Apple's optimized PNGs and compare packaged icons to the source artwork."""
from pathlib import Path
import struct
import zlib


def pixels(png):
    position = 8
    compressed = []
    apple = False
    width = height = channels = 0
    while position < len(png):
        size = struct.unpack_from('>I', png, position)[0]
        kind = png[position + 4:position + 8]
        data = png[position + 8:position + 8 + size]
        if kind == b'CgBI':
            apple = True
        elif kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', data)
            if depth != 8 or color not in (2, 6) or interlace != 0:
                raise ValueError('Unsupported PNG pixel format')
            channels = 4 if color == 6 else 3
        elif kind == b'IDAT':
            compressed.append(data)
        position += size + 12
    raw = zlib.decompress(b''.join(compressed), -15 if apple else 15)
    stride = width * channels
    if len(raw) != (stride + 1) * height:
        raise ValueError('Unexpected PNG data length')
    decoded = bytearray(stride * height)
    for y in range(height):
        method = raw[y * (stride + 1)]
        for x in range(stride):
            index = y * stride + x
            a = decoded[index - channels] if x >= channels else 0
            b = decoded[index - stride] if y else 0
            c = decoded[index - stride - channels] if y and x >= channels else 0
            p = a + b - c
            paeth = min((a, b, c), key=lambda value: abs(p - value))
            predictor = (0, a, b, (a + b) // 2, paeth)[method]
            decoded[index] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255
    rgba = bytearray()
    for index in range(0, len(decoded), channels):
        r, g, b = decoded[index:index + 3]
        alpha = decoded[index + 3] if channels == 4 else 255
        if apple:
            r, b = b, r
            r, g, b = [min(255, round(value * 255 / alpha)) if alpha else 0 for value in (r, g, b)]
        rgba.extend((r, g, b, alpha))
    return width, height, rgba


def write_png(path, width, height, rgba):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = b''.join(b'\0' + rgba[y * width * 4:(y + 1) * width * 4] for y in range(height))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))


def verify_icons(archive, prefix, output):
    checked = []
    icons = [('iphone', 'AppIcon60x60@2x.png', 'AppIcon-60x60@2x.png'),
             ('ipad', 'AppIcon76x76@2x~ipad.png', 'AppIcon-76x76@2x.png')]
    for device, packaged, source in icons:
        width, height, actual = pixels(archive.read(prefix + packaged))
        expected_width, expected_height, expected = pixels(Path('src-tauri/icons/ios', source).read_bytes())
        if (width, height) != (expected_width, expected_height):
            raise ValueError('Packaged icon dimensions mismatch: ' + device)
        difference = sum(abs(a - b) for a, b in zip(actual, expected)) / len(expected)
        if difference > 2:
            raise ValueError(f'Packaged {device} icon is not CigeChan artwork (mean pixel difference {difference:.3f})')
        write_png(output / ('ios-icon-' + device + '.png'), width, height, actual)
        checked.append({'device': device, 'meanPixelDifference': difference})
    return checked
