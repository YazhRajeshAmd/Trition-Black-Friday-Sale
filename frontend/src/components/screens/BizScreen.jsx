import styles from './BizScreen.module.css'

const BASELINE_CAP = 1000

function fmt(n) { return Math.round(n).toLocaleString('en-US') }
function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US') }

export default function BizScreen({ metrics }) {
  const {
    throughput_inf_s = 0,
    latency_p50_ms = 0,
    recs_served_cumulative = 0,
    revenue_opportunity = 0,
  } = metrics

  const conversions = recs_served_cumulative * 0.038
  const gpuPct = Math.min(100, (throughput_inf_s / (BASELINE_CAP * 5)) * 100)
  const compareFill = Math.max(20, gpuPct)

  return (
    <div className={styles.screen}>
      <h2 className={styles.panelTitle}>Infrastructure capability, in business terms</h2>
      <p className={styles.panelSub}>
        Same ROCm-enabled Triton deployment — read as throughput and cost efficiency, not just request counts
      </p>

      <div className={styles.bizCards}>
        <div className={styles.bizCard}>
          <div className={styles.bizLabel}>Peak throughput</div>
          <div className={`${styles.bizVal} ${styles.bizValAccent}`}>{fmt(throughput_inf_s)}</div>
          <div className={styles.bizSub}>inf/sec on Triton · ROCm</div>
        </div>
        <div className={styles.bizCard}>
          <div className={styles.bizLabel}>P50 latency at peak</div>
          <div className={styles.bizVal}>{Math.round(latency_p50_ms)} ms</div>
          <div className={styles.bizSub}>unchanged from light traffic</div>
        </div>
        <div className={styles.bizCard}>
          <div className={styles.bizLabel}>Recommendations served</div>
          <div className={styles.bizVal}>{fmt(recs_served_cumulative)}</div>
          <div className={styles.bizSub}>cumulative this session</div>
        </div>
        <div className={styles.bizCard}>
          <div className={styles.bizLabel}>Estimated conversions</div>
          <div className={styles.bizVal}>{fmt(conversions)}</div>
          <div className={styles.bizSub}>at 3.8% conversion rate</div>
        </div>
        <div className={styles.bizCard}>
          <div className={styles.bizLabel}>Revenue opportunity</div>
          <div className={`${styles.bizVal} ${styles.bizValTeal}`}>{fmtMoney(revenue_opportunity)}</div>
          <div className={styles.bizSub}>at $85 avg. order value</div>
        </div>
      </div>

      <div className={styles.compareCard}>
        <h4 className={styles.compareTitle}>Requests handled during peak — same hardware footprint</h4>
        <p className={styles.compareSub}>
          single-request-batch baseline vs. Triton's dynamic batcher on ROCm
        </p>
        <div className={styles.compareBars}>
          <div className={styles.compareRow}>
            <div className={styles.compareLbl}>
              <span>Static, unbatched serving</span>
              <span>1,000 inf/s ceiling</span>
            </div>
            <div className={styles.compareTrack}>
              <div className={`${styles.compareFill} ${styles.fillStandard}`} style={{ width: '20%' }}>1,000</div>
            </div>
          </div>
          <div className={styles.compareRow}>
            <div className={styles.compareLbl}>
              <span>Triton dynamic batching on ROCm</span>
              <span>{fmt(BASELINE_CAP * 5)} inf/s sustained</span>
            </div>
            <div className={styles.compareTrack}>
              <div className={`${styles.compareFill} ${styles.fillGpu}`} style={{ width: `${compareFill}%` }}>
                {fmt(throughput_inf_s)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.banner}>
        <div className={styles.bannerX}>5X</div>
        <div className={styles.bannerCopy}>
          <div className={styles.bannerEyebrow}>Same GPUs, same latency budget, five times the traffic</div>
          <p className={styles.bannerP}>
            ROCm-enabled Triton Inference Server sustains 5× more inference throughput at peak — without added infrastructure and without giving up latency.
          </p>
          <div className={styles.bannerFine}>
            The CTR model made the traffic relatable. The dynamic batcher and ROCm GPUs made the throughput possible.
          </div>
        </div>
      </div>
    </div>
  )
}
