#!/usr/bin/env python3
"""Acoustic speaker diarization for Nexus Meetings (BYO runtime, like whisper).

Usage: python3 meetings-diarize.py <wav 16k mono> <models-dir> [num-speakers]
Prints JSON: [{"start": sec, "end": sec, "speaker": int}, ...]
Requires: pip install sherpa-onnx; <models-dir>/{segmentation,embedding}.onnx
(pyannote segmentation 3.0 + NeMo titanet-small — see docs/meetings-artifacts.md).
Exit 0 with [] when nothing is detected; nonzero on setup errors so the caller
can fall back to unlabeled transcription.
"""
import json
import os
import sys
import wave

import numpy as np
import sherpa_onnx


def main():
    wav_path, models_dir = sys.argv[1], sys.argv[2]
    num_speakers = int(sys.argv[3]) if len(sys.argv) > 3 and int(sys.argv[3]) > 0 else -1
    with wave.open(wav_path) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1, 'expect 16k mono'
        samples = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    samples = samples.astype(np.float32) / 32768.0

    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=f'{models_dir}/segmentation.onnx'
            ),
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            # titanet-large preferred (more discriminating voiceprints → fewer
            # phantom-speaker splits); falls back to titanet-small (2026-07-28).
            model=(f'{models_dir}/embedding-large.onnx'
                   if os.path.exists(f'{models_dir}/embedding-large.onnx')
                   else f'{models_dir}/embedding.onnx')
        ),
        # Known speaker count (the record UI asks) beats auto-clustering by a
        # wide margin; when auto, a high threshold biases toward FEWER clusters —
        # real meetings were over-splitting one voice into several (2026-07-17).
        clustering=sherpa_onnx.FastClusteringConfig(num_clusters=num_speakers, threshold=0.9),
        # Verified tuning (2026-07-17 research): min_duration_off=0.0 is the
        # maintainer-endorsed default — gap-filling can bridge ACROSS speaker
        # turns; boundary misses are the dominant diarization failure mode.
        min_duration_on=0.2,
        min_duration_off=0.0,
    )
    sd = sherpa_onnx.OfflineSpeakerDiarization(config)
    if not sd.sample_rate == 16000:
        raise SystemExit('unexpected model sample rate')
    result = sd.process(samples).sort_by_start_time()
    # Crosstalk safety cap: overlapped speech yields mixed embeddings that match
    # nobody, so unconstrained clustering can spray dozens of phantom speakers
    # (real 5-person meeting produced 20+, 2026-07-21). If auto mode explodes,
    # re-run constrained to a sane meeting-sized cap.
    if num_speakers == -1 and len({seg.speaker for seg in result}) > 8:
        config.clustering.num_clusters = 8
        sd = sherpa_onnx.OfflineSpeakerDiarization(config)
        result = sd.process(samples).sort_by_start_time()
    print(json.dumps([
        {'start': round(seg.start, 3), 'end': round(seg.end, 3), 'speaker': seg.speaker}
        for seg in result
    ]))


if __name__ == '__main__':
    main()
