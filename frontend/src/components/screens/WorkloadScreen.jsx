import { useState, useEffect } from 'react'
import styles from './WorkloadScreen.module.css'

const PRODUCTS = [
  { icon: '🎧', name: 'Wireless Headphones', price: '$79' },
  { icon: '⌚', name: 'Fitness Watch', price: '$129' },
  { icon: '👟', name: 'Running Shoes', price: '$95' },
  { icon: '📷', name: 'Compact Camera', price: '$249' },
  { icon: '🧥', name: 'Winter Jacket', price: '$110' },
  { icon: '🎮', name: 'Game Controller', price: '$59' },
  { icon: '💻', name: 'Ultrabook', price: '$799' },
  { icon: '🔊', name: 'Bluetooth Speaker', price: '$49' },
  { icon: '🧴', name: 'Skincare Set', price: '$38' },
]

const REC_POOL = [
  { icon: '🎒', name: 'Travel Backpack', reason: 'often bought with headphones' },
  { icon: '🔋', name: 'Fast Charger 65W', reason: 'frequently viewed together' },
  { icon: '🕶️', name: 'Polarized Sunglasses', reason: 'trending in your region' },
  { icon: '⌨️', name: 'Mechanical Keyboard', reason: 'matches your browsing pattern' },
  { icon: '🧦', name: 'Merino Wool Socks', reason: 'popular add-on this hour' },
  { icon: '📱', name: 'Phone Stand', reason: 'based on recent views' },
  { icon: '🎁', name: 'Gift Wrap Bundle', reason: 'seasonal pick' },
  { icon: '🧢', name: 'Wool Beanie', reason: 'similar shoppers also liked' },
]

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

export default function WorkloadScreen({ metrics }) {
  const [browsing, setBrowsing] = useState(PRODUCTS[0])
  const [recs, setRecs] = useState(shuffle(REC_POOL).slice(0, 4))

  useEffect(() => {
    const id = setInterval(() => {
      setBrowsing(PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)])
      setRecs(shuffle(REC_POOL).slice(0, 4))
    }, 3200)
    return () => clearInterval(id)
  }, [])

  const latency = metrics?.latency_p50_ms ? Math.round(metrics.latency_p50_ms) : null

  return (
    <div className={styles.screen}>
      <h2 className={styles.panelTitle}>The example workload: a CTR recommendation model</h2>
      <p className={styles.panelSub}>
        Used here only so the throughput and latency numbers on the next two screens have a concrete, relatable model behind them
      </p>

      <div className={styles.shopGrid}>
        <div className={styles.device}>
          <div className={styles.deviceBar}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.deviceUrl}>shop.example.com/doorbusters</span>
          </div>
          <div className={styles.deviceBody}>
            <div className={styles.browsingTag}>
              Currently viewing: <strong>{browsing.name}</strong>
            </div>
            <div className={styles.productGrid}>
              {PRODUCTS.map((p) => (
                <div key={p.name} className={`${styles.product} ${p.name === browsing.name ? styles.productActive : ''}`}>
                  <div className={styles.productIcon}>{p.icon}</div>
                  <div className={styles.productName}>{p.name}</div>
                  <div className={styles.productPrice}>{p.price}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.recPanel}>
          <div className={styles.recHead}>
            <h3 className={styles.recTitle}>Recommended for you</h3>
            {latency && (
              <div className={styles.latencyBadge}>generated in {latency}ms</div>
            )}
          </div>
          <div className={styles.recList}>
            {recs.map((r, i) => (
              <div key={r.name} className={styles.recItem} style={{ animationDelay: `${i * 0.08}s` }}>
                <div className={styles.recIcon}>{r.icon}</div>
                <div className={styles.recInfo}>
                  <div className={styles.recName}>{r.name}</div>
                  <div className={styles.recReason}>{r.reason}</div>
                </div>
                <div className={styles.recMatch}>{92 - i * 4}%</div>
              </div>
            ))}
          </div>
          <div className={styles.recFoot}>
            Every scroll is a new CTR inference request. What changes screen-to-screen is how many of these arrive per second — that's the story on the Triton tab.
          </div>
        </div>
      </div>
    </div>
  )
}
