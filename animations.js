// ── Cosmetic animations only — zero data logic ────────────

// ── UV count-up ───────────────────────────────────────────
// Watches for uv-value changes and counts from 0 → target
// Uses a flag + lastTarget to prevent observer feedback loops
const uvValueEl = document.getElementById('uv-value')

let animFrame  = null
let animating  = false
let lastTarget = null

const observer = new MutationObserver(() => {
  if (animating) return

  const raw    = uvValueEl.textContent.trim()
  const target = parseFloat(raw)
  if (isNaN(target) || target === lastTarget) return

  lastTarget = target
  animating  = true

  const start    = performance.now()
  const DURATION = 420  // ms

  function tick(now) {
    const t      = Math.min((now - start) / DURATION, 1)
    const eased  = 1 - Math.pow(1 - t, 3)           // ease-out cubic
    const value  = target * eased

    // Write without triggering a "new" animation (animating = true guards it)
    uvValueEl.textContent = t < 1
      ? (Math.round(value * 10) / 10).toFixed(1)
      : (Math.round(target * 10) / 10)

    if (t < 1) {
      animFrame = requestAnimationFrame(tick)
    } else {
      animating = false
    }
  }

  if (animFrame) cancelAnimationFrame(animFrame)
  animFrame = requestAnimationFrame(tick)
})

observer.observe(uvValueEl, {
  childList:     true,
  characterData: true,
  subtree:       true,
})

// ── Refresh button spin ───────────────────────────────────
// Wraps the ↻ glyph in a span so only the icon rotates
const btn = document.getElementById('refresh-btn')
if (btn) {
  btn.innerHTML = btn.innerHTML.replace(
    '↻',
    '<span class="refresh-icon" aria-hidden="true">↻</span>'
  )

  btn.addEventListener('click', () => {
    btn.classList.add('spinning')
    btn.addEventListener(
      'animationend',
      () => btn.classList.remove('spinning'),
      { once: true }
    )
  })
}
