// ── Cosmetic animations only — zero data logic ────────────

// ── Refresh button spin ───────────────────────────────────
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
