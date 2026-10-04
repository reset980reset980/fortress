#!/usr/bin/env python3
"""Original Fortress: Nova score. Deterministic additive synthesis; no samples.

Run `python3 tools/compose_music.py` from any directory. Requires NumPy; ffmpeg
exports compact Ogg Vorbis when present, otherwise lossless WAV remains usable.
All composition, instruments, percussion and effects are editable here.
"""
from pathlib import Path
import json
import math
import shutil
import subprocess
import wave
import numpy as np

SR = 24000
OUT = Path(__file__).resolve().parents[1] / "assets" / "audio"
RNG = np.random.default_rng(20471004)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n, attack=.02, release=.15):
    e = np.ones(n)
    a = min(n, max(1, int(SR * attack)))
    r = min(n, max(1, int(SR * release)))
    e[:a] *= np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def tone(note, length, timbre="pad"):
    n = max(1, int(length * SR))
    t = np.arange(n) / SR
    f = hz(note)
    if timbre == "pad":
        s = (np.sin(2*np.pi*f*t) + .34*np.sin(2*np.pi*f*1.0021*t)
             + .13*np.sin(2*np.pi*f*2*t) + .055*np.sin(2*np.pi*f*3*t))
        s *= env(n, .65, .8) * (.93 + .07*np.sin(2*np.pi*.21*t))
    elif timbre == "pluck":
        s = (np.sin(2*np.pi*f*t) + .24*np.sin(2*np.pi*2*f*t)
             + .07*np.sin(2*np.pi*3.001*f*t))
        s *= np.exp(-t*3.3) * env(n, .008, .12)
    elif timbre == "bass":
        s = (np.sin(2*np.pi*f*t) + .19*np.sin(2*np.pi*f*2*t)
             + .065*np.sin(2*np.pi*f*3*t))
        s *= np.exp(-t*1.4) * env(n, .018, .08)
    elif timbre == "bell":
        s = (np.sin(2*np.pi*f*t)*np.exp(-t*1.8)
             + .30*np.sin(2*np.pi*f*2.003*t)*np.exp(-t*3.5)
             + .12*np.sin(2*np.pi*f*3.99*t)*np.exp(-t*5))
        s *= env(n, .004, .1)
    else:
        s = (np.sin(2*np.pi*f*t) + .25*np.sin(2*np.pi*2*f*t)
             + .10*np.sin(2*np.pi*3*f*t)) * env(n, .09, .3)
    return s


def percussion(kind):
    length = {"kick": .42, "snare": .26, "hat": .10, "tom": .38}[kind]
    t = np.arange(int(length*SR)) / SR
    noise = RNG.standard_normal(len(t))
    if kind == "kick":
        freq = 47 + 115*np.exp(-t*31)
        s = np.sin(2*np.pi*np.cumsum(freq)/SR)*np.exp(-t*10)
        s += .10*noise*np.exp(-t*110)
    elif kind == "snare":
        hi = noise - np.convolve(noise, np.ones(10)/10, mode="same")
        s = .6*hi*np.exp(-t*18) + .3*np.sin(2*np.pi*174*t)*np.exp(-t*20)
    elif kind == "hat":
        hi = noise - np.convolve(noise, np.ones(5)/5, mode="same")
        s = hi*np.exp(-t*65)*.32
    else:
        freq = 85 + 100*np.exp(-t*14)
        s = np.sin(2*np.pi*np.cumsum(freq)/SR)*np.exp(-t*12)
    return s * env(len(t), .001, .015)


def add(buf, sound, at, gain=.1, pan=0, wrap=True):
    start = round(at*SR)
    indices = np.arange(len(sound)) + start
    if not wrap:
        use = indices < len(buf)
        indices, sound = indices[use], sound[use]
    else:
        indices %= len(buf)
    gains = np.array([math.cos((pan+1)*math.pi/4), math.sin((pan+1)*math.pi/4)])
    for c in range(2):
        np.add.at(buf[:, c], indices, sound*gain*gains[c])


def space(buf, delay=.36, mix=.15, loop=True):
    n = round(delay*SR)
    for multiple, gain in ((1,mix),(2,mix*.48),(3,mix*.23)):
        d = n*multiple
        tail = np.roll(buf[:, ::-1], d, axis=0)
        if not loop:
            tail[:d] = 0
        buf += tail*gain
    return buf


def save(name, data, peak=.7):
    data = np.tanh(data)
    current = np.max(np.abs(data))
    if current:
        data *= peak/current
    pcm = (data*32767).astype("<i2")
    path = OUT / f"{name}.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    if shutil.which("ffmpeg"):
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(path),
                        "-c:a", "libvorbis", "-q:a", "4", str(path.with_suffix(".ogg"))], check=True)
        path.unlink()
        path = path.with_suffix(".ogg")
    print(f"{path.name}: {len(data)/SR:.2f}s, {path.stat().st_size//1024} KiB")
    return {"file": path.name, "duration": round(len(data)/SR, 5), "channels": 2,
            "sampleRate": SR, "peak": peak}


def menu():
    beat = 60/80
    buf = np.zeros((round(32*beat*SR), 2))
    chords = [[50,57,60,64,69], [46,53,57,62,65], [43,50,57,58,62], [45,52,57,62,64]]
    for bar in range(8):
        chord = chords[(bar//2)%4]
        for i, note in enumerate(chord):
            add(buf, tone(note, 4*beat+.85), bar*4*beat, .085, (i-2)*.28)
        for step in (0,1.5,2.5,3):
            note = chord[(int(step*2)+bar)%len(chord)] + 24
            add(buf, tone(note, beat*1.8, "bell"), (bar*4+step)*beat, .033, math.sin(bar+step)*.65)
        add(buf, tone(chord[0]-12, 4*beat, "bass"), bar*4*beat, .065)
    return space(buf, beat*.75, .20)


def battle():
    beat = 60/110
    n = round(32*beat*SR)
    base, pulse, danger = [np.zeros((n,2)) for _ in range(3)]
    chords = [[50,57,60,65], [50,57,60,65], [46,53,58,62], [46,53,58,62],
              [41,53,57,60], [41,53,57,60], [48,55,60,64], [45,52,57,61]]
    motif = [74,77,76,69,74,81,77,76]
    for bar,chord in enumerate(chords):
        for i,note in enumerate(chord):
            add(base,tone(note,beat*4+.45),bar*beat*4,.077,(i-1.5)*.3)
        for step in range(8):
            add(base,tone(chord[0]-12,beat*.75,"bass"),(bar*4+step*.5)*beat,.12 if step%2==0 else .065)
            arp = chord[(step+bar)%4]+12
            add(pulse,tone(arp,beat*.8,"pluck"),(bar*4+step*.5)*beat,.11,(-1 if step%2 else 1)*.45)
            add(pulse,percussion("hat"),(bar*4+step*.5)*beat,.055,(-1 if step%2 else 1)*.35)
        for step in (0,2,3.5):
            add(pulse,percussion("kick"),(bar*4+step)*beat,.22)
        for step in (1,3):
            add(pulse,percussion("snare"),(bar*4+step)*beat,.11,.13)
        for step in (0,1.5,2.5):
            note = motif[(bar+int(step*2))%len(motif)]
            if bar in (2,3): note -= 2
            if bar==7: note = [73,76,81][(int(step*2))%3]
            add(danger,tone(note,beat*1.7,"lead"),(bar*4+step)*beat,.125,math.sin(bar+step)*.45)
        for step in (0,1.75,2.5,3.25,3.5):
            add(danger,percussion("tom"),(bar*4+step)*beat,.11,math.cos(step)*.4)
        add(danger,tone(chord[0],beat*2,"bell"),bar*4*beat,.13,.1)
    return space(base,beat*.75,.13),space(pulse,beat*.75,.12),space(danger,beat*.5,.18)


def jingle(victory=True):
    buf = np.zeros((round((3.7 if victory else 3.5)*SR),2))
    notes = [62,65,69,74,77,81] if victory else [62,60,58,57,50]
    for i,note in enumerate(notes):
        add(buf,tone(note,1.65 if victory else 2,"bell"),i*.23,.17,math.sin(i)*.35,False)
        if i>2:
            add(buf,tone(note-12,2,"pad"),i*.23,.09,-.2,False)
    add(buf,percussion("kick"),.1,.13,0,False)
    return space(buf,.19,.25,False)


def sound_effect(name):
    durations = {"fire":.55,"impact":1.05,"shield":.65,"repair":.85,"ui":.14,"charge":.9}
    t = np.arange(round(durations[name]*SR))/SR
    noise = RNG.standard_normal(len(t))
    if name=="fire":
        f=60+165*np.exp(-t*13)
        s=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*9)+.40*noise*np.exp(-t*26)
    elif name=="impact":
        lo=np.convolve(noise,np.ones(24)/24,mode="same")
        s=lo*2*np.exp(-t*4)+.43*noise*np.exp(-t*18)+.24*np.sin(2*np.pi*41*t)*np.exp(-t*6)
    elif name=="shield":
        f=720+360*np.exp(-t*7)
        p=2*np.pi*np.cumsum(f)/SR
        s=(np.sin(p)+.4*np.sin(p*1.507))*np.exp(-t*6)*.6
    elif name=="repair":
        s=np.zeros(len(t))
        for i,note in enumerate([74,77,81,86]):
            a=round(i*.11*SR); part=tone(note,.5,"bell")
            part=part[:len(s)-a];s[a:a+len(part)]+=part*.38
    elif name=="ui":
        s=(np.sin(2*np.pi*880*t)+.3*np.sin(2*np.pi*1320*t))*np.exp(-t*35)*.5
    else:
        p=2*np.pi*np.cumsum(110+650*t*t)/SR
        s=(np.sin(p)+.2*np.sin(p*2))*np.minimum(1,t*4)*.45
        s+=noise*.04*t
    s*=env(len(t),.003,.04)
    stereo=np.column_stack((s,s))
    return space(stereo,.055,.10,False)


if __name__=="__main__":
    OUT.mkdir(parents=True,exist_ok=True)
    manifest={"title":"Fortress: Nova — The Meridian Score","composer":"Original procedural composition for this project",
              "provenance":"All notes, synthesis, drums and effects authored in compose_music.py. No third-party samples.",
              "seed":20471004,"music":{},"effects":{}}
    manifest["music"]["menu"]=save("menu_ambient",menu(),.52)
    for name,buf in zip(("battle_base","battle_pulse","battle_danger"),battle()):
        manifest["music"][name]=save(name,buf,.52)
        manifest["music"][name]["bpm"]=110
    manifest["music"]["menu"]["bpm"]=80
    for name in ("victory","defeat"):
        manifest["effects"][name]=save(name,jingle(name=="victory"),.70)
    for name in ("fire","impact","shield","repair","ui","charge"):
        manifest["effects"][name]=save(name,sound_effect(name),.78)
    (OUT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
