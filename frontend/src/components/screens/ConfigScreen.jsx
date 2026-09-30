import { useState } from 'react'
import styles from './ConfigScreen.module.css'

const CANNED_LOGS = [
  `<span class="${styles.logAmd}">I0917 12:00:01.050 1 rocm_provider_factory.cc:120] ROCm device 0: AMD Instinct — detected</span>`,
  `<span class="${styles.logAmd}">I0917 12:00:01.061 1 rocm_provider_factory.cc:120] ROCm device 1: AMD Instinct — detected</span>`,
  `<span class="${styles.logAmd}">I0917 12:00:01.072 1 rocm_provider_factory.cc:120] ROCm device 2: AMD Instinct — detected</span>`,
  `<span class="${styles.logAmd}">I0917 12:00:01.083 1 rocm_provider_factory.cc:120] ROCm device 3: AMD Instinct — detected</span>`,
  `<span class="${styles.logOk}">I0917 12:00:01.900 1 dynamic_batch_scheduler.cc:339] scheduler started — max_queue_delay_microseconds=2000</span>`,
]

function IGroupTable({ status }) {
  const statusClass = status === 'loaded' ? styles.statusOk : status === 'not ready' ? styles.statusWarn : ''
  return (
    <table className={styles.iTable}>
      <thead>
        <tr>
          <th>Instance</th>
          <th>ROCm device</th>
          <th>Kind</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {[0, 1, 2, 3].map((i) => (
          <tr key={i}>
            <td>ctr_recommender_rocm_{i}</td>
            <td>ROCm:{i}</td>
            <td>KIND_GPU</td>
            <td className={statusClass}>{status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ConfigScreen() {
  const [logs, setLogs] = useState([])
  const [iGroupStatus, setIGroupStatus] = useState('not checked')
  const [pillText, setPillText] = useState('not checked')
  const [pillType, setPillType] = useState('neutral')
  const [checking, setChecking] = useState(false)

  async function handleCheck() {
    if (checking) return
    setChecking(true)
    setLogs([])
    setIGroupStatus('checking')
    setPillText('checking')
    setPillType('neutral')

    let i = 0
    const iv = setInterval(async () => {
      if (i >= CANNED_LOGS.length) {
        clearInterval(iv)
        try {
          const resp = await fetch('/api/launch', { method: 'POST' })
          const data = await resp.json()
          if (data.ready) {
            setLogs((prev) => [
              ...prev,
              `<span class="${styles.logOk}">✓ Triton at ${data.triton_url} is ready — model '${data.model_name}' loaded (mode: live)</span>`,
            ])
            setPillText('ready')
            setPillType('ok')
            setIGroupStatus('loaded')
          } else {
            setLogs((prev) => [
              ...prev,
              `<span class="${styles.logWarn}">⚠ Triton not ready (${data.detail}). Falling back to simulated mode.</span>`,
            ])
            setPillText('not ready')
            setPillType('warn')
            setIGroupStatus('not ready')
          }
        } catch {
          setLogs((prev) => [
            ...prev,
            `<span class="${styles.logWarn}">⚠ Could not reach the backend to check Triton status.</span>`,
          ])
          setPillType('warn')
          setPillText('error')
        }
        setChecking(false)
        return
      }
      setLogs((prev) => [...prev, CANNED_LOGS[i]])
      i++
    }, 180)
  }

  return (
    <div className={styles.screen}>
      <h2 className={styles.panelTitle}>Configure the model, launch Triton on ROCm</h2>
      <p className={styles.panelSub}>
        Everything downstream — the batching behavior, the GPU utilization, the flat latency — is a consequence of what's set here
      </p>

      <div className={styles.devGrid}>
        <div className={styles.codeCard}>
          <div className={styles.codeHead}>
            <span className={styles.filename}>triton_repo/ctr_recommender/config.pbtxt</span>
          </div>
          <pre className={styles.codeBody}>{`name: `}<span className={styles.s}>{`"ctr_recommender"`}</span>{`
platform: `}<span className={styles.s}>{`"onnxruntime_onnx"`}</span>{`
max_batch_size: `}<span className={styles.n}>{`256`}</span>{`

`}<span className={styles.hl}><span className={styles.k}>{`dynamic_batching`}</span>{` {
  preferred_batch_size: [ `}<span className={styles.n}>{`32`}</span>{`, `}<span className={styles.n}>{`64`}</span>{`, `}<span className={styles.n}>{`128`}</span>{`, `}<span className={styles.n}>{`256`}</span>{` ]
  max_queue_delay_microseconds: `}<span className={styles.n}>{`2000`}</span>{`
}`}</span>{`  `}<span className={styles.c}>{`// ← the scheduler's wait/dispatch budget`}</span>{`

`}<span className={styles.hl}><span className={styles.k}>{`instance_group`}</span>{` [
  {
    name: `}<span className={styles.s}>{`"ctr_recommender_rocm"`}</span>{`
    count: `}<span className={styles.n}>{`4`}</span>{`
    kind: KIND_GPU
    gpus: [ `}<span className={styles.n}>{`0`}</span>{`, `}<span className={styles.n}>{`1`}</span>{`, `}<span className={styles.n}>{`2`}</span>{`, `}<span className={styles.n}>{`3`}</span>{` ]
  }
]`}</span>{`  `}<span className={styles.c}>{`// ← one instance pinned per ROCm GPU`}</span>{`

`}<span className={styles.hl}><span className={styles.k}>{`optimization`}</span>{` {
  execution_accelerators {
    gpu_execution_accelerator: [
      { name: `}<span className={styles.s}>{`"rocm"`}</span>{`
        parameters { key: `}<span className={styles.s}>{`"precision_mode"`}</span>{` value: `}<span className={styles.s}>{`"fp16"`}</span>{` }
      }
    ]
  }
}`}</span>{`  `}<span className={styles.c}>{`// ← ROCm execution provider + precision`}</span></pre>
          <div className={styles.devNote}>
            <strong>max_queue_delay_microseconds</strong> is the key scheduler knob: it caps how long Triton
            waits to fill a bigger batch before dispatching. This exact file lives at{' '}
            <code>triton_repo/ctr_recommender/config.pbtxt</code> in the project folder — edit it there, not here.
          </div>
        </div>

        <div>
          <div className={styles.termCard}>
            <div className={styles.termHead}>
              <span>$</span>&nbsp;launch
            </div>
            <div className={styles.termBody}>
              <div><span className={styles.prompt}>$</span> tritonserver --model-repository=./triton_repo \</div>
              <div>&nbsp;&nbsp;--backend-config=onnxruntime,rocm-execution-provider=true</div>
              {logs.map((line, i) => (
                <div key={i} dangerouslySetInnerHTML={{ __html: line }} />
              ))}
            </div>
            <div className={styles.launchRow}>
              <button className={styles.launchBtn} onClick={handleCheck} disabled={checking}>
                {checking ? 'Checking…' : 'Check Triton Status'}
              </button>
              <span className={`${styles.statusPill} ${pillType === 'ok' ? styles.pillOk : pillType === 'warn' ? styles.pillWarn : ''}`}>
                {pillText}
              </span>
            </div>
          </div>

          <div className={styles.iCard}>
            <h4 className={styles.iCardTitle}>Per-instance-group breakdown</h4>
            <p className={styles.iCardSub}>how the 4 model instances map onto ROCm devices</p>
            <IGroupTable status={iGroupStatus} />
          </div>
        </div>
      </div>
    </div>
  )
}
