# Fortress: Nova — The Meridian Score

Original composition, instruments and sound design for this game. No sampled
music, commercial tracks or third-party sound recordings are used.

Rebuild the assets with `python3 tools/compose_music.py` (NumPy and ffmpeg).
The source contains the complete score, harmonic progression, deterministic
random seed, synth envelopes, percussion and effect definitions. The manifest
records the rendered files and technical details.

- `menu_ambient.ogg`: 80 BPM, 8 bars. D minor ninth, B-flat major seventh,
  G minor ninth and suspended A harmony, shimmering bell melody.
- `battle_base.ogg`: 110 BPM, 8 bars. Pulsed sub bass and cinematic pads.
- `battle_pulse.ogg`: same phase and length; percussion and stereo arpeggios.
- `battle_danger.ogg`: same phase and length; higher lead and tense tom motif.
- `victory.ogg` / `defeat.ogg`: original result fanfares.
- `fire`, `impact`, `shield`, `repair`, `ui`, `charge`: synthesized game cues.

All battle stems start together and stay synchronized. Scene transitions and
combat intensity alter gain over time; they do not restart the score. The
director decodes each file once, limits effects to 16 voices, and includes
native synthesized fallbacks when download or decoding fails. Master, music,
effects and mute controls apply to both exported audio and the fallbacks.
