# Full-World AISStream Benchmark

Generated: 2026-07-02T18:22:47.482Z

## Executive Summary

- Verdict: **STABLE_FOR_LONGER_TEST**
- Total messages received: 50982
- Average messages/sec: 85
- Peak one-second rate: 129
- Total inbound bytes: 28379146
- Total inbound MB: 27.1
- Average bytes/message: 556.7
- Average inbound KB/sec: 46.2
- Peak inbound KB/sec: 70
- Projected inbound GB/hour: 0.2
- Projected inbound GB/day: 3.8
- Projected inbound GB/30-day month: 114.2
- Verified MMSIs loaded: 109
- Verified messages matched: 144
- Distinct verified MMSIs observed: 50
- Discarded as not verified: 99.6%
- Database writes attempted: 0
- Database writes completed: 0
- Scale recommendation: CANDIDATE_FOR_SMALL_CLOUD_WORKER_TEST

## Connection

| Metric | Value |
| --- | --- |
| Socket opened | true |
| Subscription sent | true |
| Duration ms | 600034 |
| Close code | none |
| Reconnect count | 0 |

## Process Health

| Metric | Value |
| --- | ---: |
| RSS start/peak/end MB | 61.8 / 78.6 / 73.5 |
| Heap used start/peak/end MB | 11.4 / 15.4 / 14 |
| Heap total start/peak/end MB | 18.6 / 22 / 15.3 |
| External memory start/peak/end MB | 3.5 / 5.9 / 5.2 |
| Average process CPU % | 1.2 |
| Peak interval process CPU % | 2.3 |
| CPU user time ms | 4578 |
| CPU system time ms | 2328 |
| Event-loop mean ms | 27.4 |
| Event-loop p95 ms | 32.5 |
| Event-loop max ms | 36.7 |
| Interval peak event-loop delay ms | 36.7 |
| Peak pending messages | 1 |
| Backlog observed | false |

## Future Storage Estimate

| Metric | Value |
| --- | ---: |
| Verified positions/hour | 864 |
| Verified positions/day | 20735 |
| Verified positions/30-day month | 622045 |
| Raw position storage for retention MB | 444.9 |
| Daily aggregate storage/month MB | 0.7 |
| Position retention days | 90 |
| Estimated verified position bytes | 250 |
| Estimated daily aggregate bytes | 500 |

## Resource & Scale Estimate

| Metric | Value |
| --- | ---: |
| Inbound GB/month projection | 114.2 |
| Average / peak inbound KB/sec | 46.2 / 70 |
| Process CPU average / peak % | 1.2 / 2.3 |
| Memory peak MB | 78.6 |
| Estimated verified writes/day | 20735 |
| Raw position storage for retention MB | 444.9 |
| Daily aggregate storage/month MB | 0.7 |
| Recommendation | CANDIDATE_FOR_SMALL_CLOUD_WORKER_TEST |

Assumptions: 90 retention days, 250 bytes per verified position, 500 bytes per daily aggregate row. Projections are linear estimates based on the observed benchmark window.

## Caveats

- This short benchmark does not prove production readiness.
- This benchmark does not prove global AIS coverage.
- This benchmark does not claim all cruise vessels are tracked.
