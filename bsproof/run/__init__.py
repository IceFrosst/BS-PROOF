"""
The stages of one pipeline run, split out of run_pipeline.py on 2026-10-03.

    options   parse the command line into RunOptions
    corpus    retrieve / expand the corpus, OA + relevance gates
    extract   wiring, Grok or Claude extraction, and SR inheritance
    score     score the stored variant, print the A/B comparisons and results
    report    the run's mode label and the immutable report

run_pipeline.py stays the entry point and only wires these together. Module
level imports here stay offline-safe: the selftest imports corpus helpers on
the bare interpreter.
"""
