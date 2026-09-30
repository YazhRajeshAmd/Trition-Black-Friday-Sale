import { useState, useEffect, useRef } from 'react'
import Header from './components/Header/Header.jsx'
import Footer from './components/Footer/Footer.jsx'
import DashboardBar from './components/DashboardBar/DashboardBar.jsx'
import FeatureCards from './components/FeatureCards/FeatureCards.jsx'
import OnboardingTour from './components/OnboardingTour/OnboardingTour.jsx'
import ConfigScreen from './components/screens/ConfigScreen.jsx'
import WorkloadScreen from './components/screens/WorkloadScreen.jsx'
import TritonScreen from './components/screens/TritonScreen.jsx'
import BizScreen from './components/screens/BizScreen.jsx'
import styles from './App.module.css'

const HISTORY_LEN = 24

const EMPTY_METRICS = {
  mode: 'connecting',
  rushing: false,
  regime: 'light',
  shoppers: 0,
  throughput_inf_s: 0,
  latency_p50_ms: 0,
  latency_p99_ms: 0,
  gpu_utilization: [0, 0, 0, 0],
  gpu_utilization_source: null,
  recs_served_cumulative: 0,
  revenue_opportunity: 0,
  baseline_cap: 1000,
  queue_depth: null,
  batch_size_estimate: null,
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('triton_theme') || 'dark')
  const [metrics, setMetrics] = useState(EMPTY_METRICS)
  const [offline, setOffline] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [history, setHistory] = useState({
    shoppers: Array(HISTORY_LEN).fill(0),
    throughput: Array(HISTORY_LEN).fill(0),
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('triton_theme', theme)
  }, [theme])

  const metricsRef = useRef(metrics)
  metricsRef.current = metrics

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const resp = await fetch('/api/metrics')
        if (!resp.ok) throw new Error('bad status')
        const data = await resp.json()
        if (!cancelled) {
          setMetrics(data)
          setOffline(false)
          setHistory((prev) => ({
            shoppers: [...prev.shoppers.slice(1), data.shoppers],
            throughput: [...prev.throughput.slice(1), data.throughput_inf_s],
          }))
        }
      } catch {
        if (!cancelled) setOffline(true)
      }
    }

    poll()
    const id = setInterval(poll, 700)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  async function handleRush() {
    const action = metrics.rushing ? 'stop' : 'start'
    await fetch('/api/rush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
  }

  async function handleReset() {
    await fetch('/api/reset', { method: 'POST' })
  }

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  const screens = [
    <ConfigScreen key="config" />,
    <WorkloadScreen key="workload" metrics={metrics} />,
    <TritonScreen key="triton" metrics={metrics} history={history} />,
    <BizScreen key="biz" metrics={metrics} />,
  ]

  return (
    <div className={styles.app} style={{ position: 'relative' }}>
      {offline && (
        <div className={styles.offlineBanner}>
          Can't reach the backend at /api/metrics — is app.py running?
        </div>
      )}

      <Header />

      <DashboardBar
        metrics={metrics}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRush={handleRush}
        onReset={handleReset}
      />

      <main className={styles.main}>
        {screens[activeTab]}
        <FeatureCards />
      </main>

      <Footer />
      <OnboardingTour theme={theme} onToggle={toggleTheme} />
    </div>
  )
}
