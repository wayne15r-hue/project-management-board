"""Generate four original Helios tune sketches; standard library only.

No samples, recordings, or third-party compositions. See public/audio/ringtones/README.md.
"""
import array
import json
import math
from pathlib import Path
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
DURATION = 6.0
TUNES = [
    ('dawn-chimes', 'Dawn Chimes', 'A bright, gently rising chime.', [72, 76, 79, 83, 79, 76], 'chime'),
    ('warm-keys', 'Warm Keys', 'A soft, unhurried keyboard phrase.', [60, 64, 67, 69, 67, 64], 'keys'),
    ('soft-marimba', 'Soft Marimba', 'A light, rounded wooden melody.', [67, 72, 74, 76, 74, 72, 67, 64], 'marimba'),
    ('orbit-bells', 'Orbit Bells', 'A mellow pair of repeating bell phrases.', [69, 76, 81, 76, 71, 78, 83, 78], 'bell'),
]


def create_tune(notes, timbre):
    samples = [0.0] * int(RATE * DURATION)
    spacing = 0.42 if len(notes) == 8 else 0.52
    for index, midi in enumerate(notes):
        frequency = 440 * 2 ** ((midi - 69) / 12)
        start = int((0.12 + index * spacing) * RATE)
        length = int(1.55 * RATE)
        for j in range(min(length, len(samples) - start)):
            t = j / RATE
            attack = min(1, t / 0.012)
            release = min(1, (length - j) / (RATE * 0.06))
            phase = 2 * math.pi * frequency * t
            if timbre == 'chime':
                value = math.sin(phase) * math.exp(-t * 3) + 0.18 * math.sin(phase * 2) * math.exp(-t * 6)
            elif timbre == 'keys':
                value = (math.sin(phase) + 0.22 * math.sin(phase * 2) + 0.08 * math.sin(phase * 3)) * math.exp(-t * 3.5)
            elif timbre == 'marimba':
                value = math.sin(phase) * math.exp(-t * 6) + 0.18 * math.sin(phase * 4) * math.exp(-t * 13)
            else:
                value = math.sin(phase) * math.exp(-t * 2.6) + 0.12 * math.sin(phase * 2.01) * math.exp(-t * 4.5)
            samples[start + j] += value * attack * release
    peak = max(abs(x) for x in samples)
    normalized = [x * 0.24 / peak for x in samples]
    return normalized


if __name__ == '__main__':
    destination = ROOT / 'public' / 'audio' / 'ringtones'
    destination.mkdir(parents=True, exist_ok=True)
    manifest = []
    for slug, name, description, notes, timbre in TUNES:
        values = create_tune(notes, timbre)
        pcm = array.array('h', (round(x * 32767) for x in values))
        with wave.open(str(destination / f'{slug}.wav'), 'wb') as output:
            output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            output.writeframes(pcm.tobytes())
        rms = math.sqrt(sum(x * x for x in values) / len(values))
        manifest.append(dict(id=slug, name=name, description=description, duration=DURATION,
                             peakDbFS=round(20 * math.log10(max(abs(x) for x in values)), 2),
                             rmsDbFS=round(20 * math.log10(rms), 2), file=f'{slug}.wav'))
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, indent=2))
