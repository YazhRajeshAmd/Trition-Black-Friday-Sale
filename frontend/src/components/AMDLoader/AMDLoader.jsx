import styles from './AMDLoader.module.css'

export default function AMDLoader({ label = 'Running inference on AMD MI300X…' }) {
  return (
    <div className={styles.wrap}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className={styles.svg}>
        <defs>
          <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00C2DE" />
            <stop offset="50%" stopColor="#C1A968" />
            <stop offset="100%" stopColor="#00C2DE" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="-1 0"
              to="1 0"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="48" height="48" rx="10" stroke="url(#shimmer)" strokeWidth="2.5" fill="none" />
        <rect x="16" y="16" width="24" height="24" rx="4" stroke="url(#shimmer)" strokeWidth="2" fill="none" />
        <line x1="16" y1="8" x2="16" y2="4" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="28" y1="8" x2="28" y2="4" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="40" y1="8" x2="40" y2="4" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="16" y1="52" x2="16" y2="48" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="28" y1="52" x2="28" y2="48" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="40" y1="52" x2="40" y2="48" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="8" y1="16" x2="4" y2="16" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="8" y1="28" x2="4" y2="28" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="8" y1="40" x2="4" y2="40" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="52" y1="16" x2="48" y2="16" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="52" y1="28" x2="48" y2="28" stroke="url(#shimmer)" strokeWidth="2" />
        <line x1="52" y1="40" x2="48" y2="40" stroke="url(#shimmer)" strokeWidth="2" />
      </svg>
      <div className={styles.label}>{label}</div>
      <div className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  )
}
