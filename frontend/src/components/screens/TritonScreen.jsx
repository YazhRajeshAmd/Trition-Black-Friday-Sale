import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import styles from './TritonScreen.module.css'

function fmt(n) { return Math.round(n).toLocaleString('en-US') }

export default function TritonScreen({ metrics, history }) {
  const {
    regime = 'light',
    shoppers = 0,
    throughput_inf_s = 0,
    latency_p50_ms = 0,
    batch_size_estimate = 0,
    queue_depth = null,
    gpu_utilization = [0, 0, 0, 0],
    gpu_utilization_source = null,
  } = metrics

  const heavy = regime === 'heavy'
  const batch = batch_size_estimate || 0
  const batchPct = Math.min(100, (batch / 256) * 100)

  const shopperData = history.shoppers.map((v, i) => ({ i, v }))
  const throughputData = history.throughput.map((v, i) => ({ i, v }))

  return (
    <div className={styles.screen}>
      <h2 className={styles.panelTitle}>Triton Inference Server, on ROCm, under real traffic</h2>
      <p className={styles.panelSub}>
        How the serving stack behaves as load moves from light to heavy — not the model, the infrastructure underneath it
      </p>

      <div className={styles.opsGrid}>
        <div className={`${styles.card} ${styles.span2}`}>
          <h4 className={styles.cardTitle}>System behavior: light vs. heavy traffic</h4>
          <p className={styles.cardCap}>reference operating points — the highlighted column tracks live data</p>
          <div className={styles.regimeGrid}>
            <div className={`${styles.regimeCol} ${!heavy ? styles.regimeActive : ''}`}>
              <div className={styles.regimeHead}>
                <div className={styles.regimeName}>Light traffic</div>
                <div className={`${styles.regimeTag} ${!heavy ? styles.regimeTagActive : ''}`}>
                  {!heavy ? 'live now' : 'reference'}
                </div>
              </div>
              <div className={styles.regimeRow}><span className={styles.k}>Concurrent shoppers</span><span className={styles.v}>~300</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>Throughput</span><span className={styles.v}>~330 inf/s</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>P50 / P99 latency</span><span className={styles.v}>36 / 50 ms</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>Dynamic batch size</span><span className={styles.v}>~16</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>GPU utilization</span><span className={styles.v}>~38%</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>Request queue depth</span><span className={styles.v}>~0</span></div>
            </div>
            <div className={`${styles.regimeCol} ${heavy ? styles.regimeActive : ''}`}>
              <div className={styles.regimeHead}>
                <div className={styles.regimeName}>Heavy traffic (5×)</div>
                <div className={`${styles.regimeTag} ${heavy ? styles.regimeTagActive : ''}`}>
                  {heavy ? 'live now' : 'reference'}
                </div>
              </div>
              <div className={styles.regimeRow}><span className={styles.k}>Concurrent shoppers</span><span className={styles.v}>~4,800</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>Throughput</span><span className={styles.v}>~5,000 inf/s</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>P50 / P99 latency</span><span className={styles.v}>47 / 66 ms</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>Dynamic batch size</span><span className={styles.v}>~248</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>GPU utilization</span><span className={styles.v}>~89%</span></div>
              <div className={styles.regimeRow}><span className={styles.k}>Request queue depth</span><span className={styles.v}>~0</span></div>
            </div>
          </div>
          <div className={styles.liveNote}>
            Live numbers below (current: <strong>{fmt(throughput_inf_s)} inf/s</strong>, P50 <strong>{Math.round(latency_p50_ms)} ms</strong>) come straight from <code>/api/metrics</code>.
          </div>
        </div>

        <div className={styles.card}>
          <h4 className={styles.cardTitle}>Concurrent shoppers</h4>
          <p className={styles.cardCap}>arrival-side load over time</p>
          <div className={styles.chartBox}>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={shopperData}>
                <XAxis dataKey="i" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: 'var(--amd-bg-card)', border: '1px solid var(--amd-border-mid)', borderRadius: 6, fontFamily: 'var(--font-primary)', fontSize: 12 }}
                  labelFormatter={() => ''}
                  formatter={(v) => [fmt(v), 'Shoppers']}
                />
                <Line type="monotone" dataKey="v" stroke="#ef4444" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.card}>
          <h4 className={styles.cardTitle}>Throughput scaling</h4>
          <p className={styles.cardCap}>inferences/sec served vs. single-request-batch baseline</p>
          <div className={styles.chartBox}>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={throughputData}>
                <XAxis dataKey="i" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: 'var(--amd-bg-card)', border: '1px solid var(--amd-border-mid)', borderRadius: 6, fontFamily: 'var(--font-primary)', fontSize: 12 }}
                  labelFormatter={() => ''}
                  formatter={(v) => [fmt(v), 'inf/s']}
                />
                <Line type="monotone" dataKey="v" stroke="#00C2DE" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.card}>
          <h4 className={styles.cardTitle}>Triton dynamic batcher</h4>
          <p className={styles.cardCap}>estimated batch size — larger batches, same per-request latency</p>
          <div className={styles.batchRow}>
            <div className={styles.batchTrack}>
              <div className={styles.batchFill} style={{ width: `${batchPct}%` }} />
            </div>
            <div className={styles.batchNum}>{Math.round(batch)}</div>
          </div>
          <p className={styles.cardCap} style={{ marginTop: 10 }}>
            queue depth: <span style={{ color: 'var(--amd-white)' }}>{queue_depth != null ? queue_depth : '—'}</span> (stays near 0 if batching keeps up)
          </p>
        </div>

        <div className={styles.card}>
          <h4 className={styles.cardTitle}>GPU utilization — ROCm devices</h4>
          <p className={styles.cardCap}>source: {gpu_utilization_source || 'unavailable'}</p>
          <div className={styles.gpuList}>
            {gpu_utilization.map((g, i) => (
              <div key={i} className={styles.gpuRow}>
                <div className={styles.gpuName}>GPU {i}</div>
                <div className={styles.gpuTrack}>
                  <div className={styles.gpuFill} style={{ width: `${g}%` }} />
                </div>
                <div className={styles.gpuPct}>{Math.round(g)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
