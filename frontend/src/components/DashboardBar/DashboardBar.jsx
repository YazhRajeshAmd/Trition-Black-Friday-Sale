import { motion } from 'framer-motion'
import styles from './DashboardBar.module.css'

const TABS = ['Configure & Launch', 'Example Workload', 'Triton on ROCm', 'Business Impact']
const HEAVY_REF = 5200

function fmt(n) { return Math.round(n).toLocaleString('en-US') }
function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US') }

export default function DashboardBar({ metrics, activeTab, onTabChange, onRush, onReset }) {
  const {
    mode = 'connecting',
    rushing = false,
    shoppers = 0,
    throughput_inf_s = 0,
    latency_p50_ms = 0,
    latency_p99_ms = 0,
    gpu_utilization = [0, 0, 0, 0],
    gpu_utilization_source = null,
    revenue_opportunity = 0,
    baseline_cap = 1000,
  } = metrics

  const loadRatio = Math.min(1, shoppers / HEAVY_REF)
  const gaugeWidth = 8 + loadRatio * 90
  const mult = Math.max(1, throughput_inf_s / baseline_cap)
  const avgGpu = gpu_utilization.reduce((a, b) => a + b, 0) / (gpu_utilization.length || 1)

  const isLive = mode === 'live'
  const isSimulated = mode === 'simulated'

  return (
    <motion.div
      className={styles.bar}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.2 }}
    >
      <div className={styles.pill}>
      <div className={styles.inner}>
        <div className={styles.topRow}>
          <div className={styles.titleBlock}>
            <div className={styles.eyebrow}>Model serving under real traffic</div>
            <div className={styles.title}>
              Black Friday <span className={styles.titleAccent}>Shopping Rush</span>
            </div>
            <div className={styles.subtitle}>
              Serving stack: <span className={styles.subtitleAccent}>Triton Inference Server on ROCm</span>
              <span className={styles.divider}>|</span>
              Example workload: CTR recommendation model
            </div>
          </div>

          <div className={styles.controls}>
            <div className={`${styles.modePill} ${isLive ? styles.modeLive : isSimulated ? styles.modeSimulated : ''}`}>
              <span className={styles.modeDot} />
              <span>
                {isLive ? 'LIVE — Triton on ROCm' : isSimulated ? 'SIMULATED (no Triton reachable)' : 'Connecting…'}
              </span>
            </div>
            <button
              className={`${styles.btn} ${rushing ? styles.btnActive : styles.btnPrimary}`}
              data-tour="submit"
              onClick={onRush}
            >
              {rushing ? 'Stop the Rush' : 'Start the Rush'}
            </button>
            <button className={styles.btn} onClick={onReset}>
              Reset
            </button>
          </div>
        </div>

        <div className={styles.gaugeSection} data-tour="form">
          <div className={styles.gaugeMeta}>
            <span>Concurrent shopper load</span>
            <span>
              Capacity: <strong>{fmt(baseline_cap)} inf/s baseline</strong>
            </span>
          </div>
          <div className={styles.gaugeTrack}>
            <motion.div
              className={styles.gaugeFill}
              animate={{ width: `${gaugeWidth}%` }}
              transition={{ duration: 0.6, ease: [0.3, 0.9, 0.3, 1] }}
            />
            <div className={styles.gaugeLabels}>
              <span>{fmt(shoppers)} active shoppers</span>
              <span>{mult.toFixed(1)}× baseline</span>
            </div>
          </div>
        </div>

        <div className={styles.statStrip}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Throughput</div>
            <div className={`${styles.statValue} ${styles.statTeal}`}>{fmt(throughput_inf_s)}</div>
            <div className={styles.statSub}>inferences / sec on Triton</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>P50 Latency</div>
            <div className={`${styles.statValue} ${styles.statTeal}`}>{Math.round(latency_p50_ms)} ms</div>
            <div className={styles.statSub}>held flat under load</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>P99 Latency</div>
            <div className={`${styles.statValue} ${styles.statTeal}`}>{Math.round(latency_p99_ms)} ms</div>
            <div className={styles.statSub}>tail latency, same guarantee</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>GPU Utilization</div>
            <div className={`${styles.statValue} ${styles.statTeal}`}>{Math.round(avgGpu)}%</div>
            <div className={styles.statSub}>
              {gpu_utilization_source ? `source: ${gpu_utilization_source}` : 'ROCm devices, avg cluster'}
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Revenue Opportunity</div>
            <div className={`${styles.statValue} ${styles.statGold}`}>{fmtMoney(revenue_opportunity)}</div>
            <div className={styles.statSub}>business read-out</div>
          </div>
        </div>

        <div className={styles.tabNav} data-tour="results">
          {TABS.map((label, i) => (
            <button
              key={label}
              className={`${styles.tab} ${activeTab === i ? styles.tabActive : ''}`}
              onClick={() => onTabChange(i)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.disclaimer}>
        This UI is an <strong>illustrative concept</strong> for this demo. In LIVE mode the numbers
        are real, measured against your Triton server; in SIMULATED mode (no Triton reachable) they
        follow a scripted ramp for rehearsal.
      </div>
      </div>
    </motion.div>
  )
}
