import { useState, useMemo } from 'react'
import { getType, deriveNOI, num } from './typeMap.js'
import { buildIncomeMatrix, CAP_MULTIPLIER } from './incomeMatrix.js'
import { residentialMAO } from '../../math/residential.js'
import { loadConstants } from '../../math/constants.js'

// Portfolio analyzer: N buildings of the SAME type (chosen in the MAIN dropdown;
// turned on by the Portfolio checkbox) → a per-building offer AND a portfolio
// offer. No new math — each building runs through that type's existing Bible
// engine; the portfolio pools the result.

const money = (n) => (n == null || !Number.isFinite(Number(n))) ? '—' : '$' + Math.round(Number(n)).toLocaleString()
const card = { background: '#fff', border: '1px solid #d4dae8', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }
const h3 = { margin: '0 0 8px', fontSize: 15, color: '#0A0F2C', borderBottom: '2px solid #C9A84C', paddingBottom: 4 }
const inp = { width: '100%', padding: '7px 9px', border: '1px solid #d4dae8', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 11, fontWeight: 600, color: '#1E2A45', margin: '6px 0 2px' }

// MF 5–19 offer (agency 80/20 @ 7%/30yr) — replicates the multifamily_small engine.
function mfSmallOffer(noi) {
  if (noi <= 0) return 0
  const C = loadConstants()
  const bank = noi / (C.DSCR_CONSERVATIVE * C.K_BANK_RESI)
  return Math.round(bank / C.LTV_RESI)
}

function categoryFor(assetType) {
  if (assetType === 'residential') return 'flip'
  if (assetType === 'ios_land') return 'land'
  return 'income' // storage, MF tiers, commercial, MHP, RV, IOS, mixed
}

// Per-building offer through the correct engine for the type.
function buildingOffer(assetType, b) {
  const cat = categoryFor(assetType)
  if (cat === 'flip') {
    const arv = num(b.arv); const rehab = num(b.rehab)
    return arv > 0 ? Math.max(0, Math.round(residentialMAO(arv, rehab).yourOffer)) : 0
  }
  if (cat === 'land') return 0
  const noi = deriveNOI(b)
  if (noi <= 0) return 0
  if (assetType === 'multifamily_small') return mfSmallOffer(noi)
  return buildIncomeMatrix({ assetType, noi }).summary.conservativeValue
}

const blankBuilding = (n) => ({ label: `Building ${n}`, address: '', askingPrice: '', grossIncome: '', expenses: '', arv: '', rehab: '', acres: '' })

export default function PortfolioSection({ assetType }) {
  const [buildings, setBuildings] = useState([blankBuilding(1), blankBuilding(2)])
  const cat = categoryFor(assetType)
  const typeLabel = getType(assetType)?.label || assetType
  const capMult = CAP_MULTIPLIER[assetType] || null

  const setB = (i, k, v) => setBuildings(p => p.map((b, j) => j === i ? { ...b, [k]: v } : b))
  const addB = () => setBuildings(p => [...p, blankBuilding(p.length + 1)])
  const delB = (i) => setBuildings(p => p.length > 1 ? p.filter((_, j) => j !== i) : p)

  const analysis = useMemo(() => {
    const rows = buildings.map(b => {
      const noi = cat === 'income' ? deriveNOI(b) : 0
      const offer = buildingOffer(assetType, b)
      const capValue = (capMult && noi > 0) ? Math.round(noi * capMult) : null
      return { ...b, noi, offer, capValue, asking: num(b.askingPrice) }
    })
    const sumNOI = rows.reduce((a, r) => a + r.noi, 0)
    const sumOffers = rows.reduce((a, r) => a + r.offer, 0)
    const sumAsking = rows.reduce((a, r) => a + r.asking, 0)
    // Pooled portfolio offer: income pools NOI through one matrix; flip sums MAOs.
    let pooled = sumOffers, range = [sumOffers, sumOffers]
    if (cat === 'income' && sumNOI > 0) {
      if (assetType === 'multifamily_small') { pooled = mfSmallOffer(sumNOI); range = [pooled, pooled] }
      else { const m = buildIncomeMatrix({ assetType, noi: sumNOI }); pooled = m.summary.conservativeValue; range = m.summary.recommendedOfferRange }
    }
    const pooledCap = (capMult && sumNOI > 0) ? Math.round(sumNOI * capMult) : null
    return { rows, sumNOI, sumOffers, sumAsking, pooled, range, pooledCap }
  }, [assetType, buildings, cat, capMult])

  return (
    <div>
      <div style={card} className="no-print">
        <h3 style={h3}>Portfolio — {typeLabel}</h3>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
          Multiple buildings of this type on one sheet. {cat === 'flip' ? 'Each building: ARV + rehab → MAO.' : cat === 'land' ? 'Land is intake-only — no offer engine.' : 'Each building: income − expenses → NOI → offer.'} Change the type in the dropdown above; uncheck Portfolio for a single property.
        </p>
      </div>

      {buildings.map((b, i) => (
        <div key={i} style={card} className="no-print">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b style={{ color: '#0A0F2C' }}>{b.label || `Building ${i + 1}`}</b>
            <button type="button" onClick={() => delB(i)} style={{ border: '1px solid #B23030', color: '#B23030', background: '#fff', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>Remove</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>Label / name</label><input style={inp} value={b.label} onChange={e => setB(i, 'label', e.target.value)} /></div>
            <div><label style={lbl}>Address</label><input style={inp} value={b.address} onChange={e => setB(i, 'address', e.target.value)} /></div>
            <div><label style={lbl}>Asking Price ($)</label><input style={inp} inputMode="decimal" value={b.askingPrice} onChange={e => setB(i, 'askingPrice', e.target.value)} /></div>
            {cat === 'flip' && <>
              <div><label style={lbl}>ARV ($)</label><input style={inp} inputMode="decimal" value={b.arv} onChange={e => setB(i, 'arv', e.target.value)} /></div>
              <div><label style={lbl}>Rehab ($)</label><input style={inp} inputMode="decimal" value={b.rehab} onChange={e => setB(i, 'rehab', e.target.value)} /></div>
            </>}
            {cat === 'income' && <>
              <div><label style={lbl}>Gross Annual Income ($)</label><input style={inp} inputMode="decimal" value={b.grossIncome} onChange={e => setB(i, 'grossIncome', e.target.value)} /></div>
              <div><label style={lbl}>Annual Operating Expenses ($)</label><input style={inp} inputMode="decimal" value={b.expenses} onChange={e => setB(i, 'expenses', e.target.value)} /></div>
            </>}
            {cat === 'land' && <div><label style={lbl}>Acres</label><input style={inp} inputMode="decimal" value={b.acres} onChange={e => setB(i, 'acres', e.target.value)} /></div>}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#1a2456' }}>
            {cat === 'income' && <>NOI <b>{money(analysis.rows[i]?.noi)}</b> · </>}
            {cat === 'land' ? <span style={{ color: '#6b7280' }}>Intake only — no offer.</span> : <>Offer <b>{money(analysis.rows[i]?.offer)}</b></>}
            {analysis.rows[i]?.capValue != null && <> · Cap-mult <b>{money(analysis.rows[i].capValue)}</b></>}
          </div>
        </div>
      ))}

      <button type="button" onClick={addB} className="no-print" style={{ marginBottom: 12, padding: '8px 16px', borderRadius: 6, border: '1px solid #0A0F2C', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>+ Add building</button>

      {/* Per-building table */}
      <div style={card}>
        <h3 style={h3}>Per-Building Offers — {typeLabel}</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
            <thead><tr>{['Building', 'Asking', cat === 'income' ? 'NOI' : null, cat === 'land' ? null : 'Offer', capMult ? `Cap ×${capMult}` : null].filter(Boolean).map((hh, i) => (
              <th key={i} style={{ padding: '6px 9px', background: '#0A0F2C', color: '#fff', fontSize: 12, textAlign: i ? 'right' : 'left' }}>{hh}</th>
            ))}</tr></thead>
            <tbody>
              {analysis.rows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 ? '#f7f9fd' : '#fff' }}>
                  <td style={{ padding: '6px 9px', fontWeight: 600 }}>{r.label || `Building ${i + 1}`}</td>
                  <td style={{ padding: '6px 9px', textAlign: 'right' }}>{money(r.asking)}</td>
                  {cat === 'income' && <td style={{ padding: '6px 9px', textAlign: 'right' }}>{money(r.noi)}</td>}
                  {cat !== 'land' && <td style={{ padding: '6px 9px', textAlign: 'right' }}>{money(r.offer)}</td>}
                  {capMult && <td style={{ padding: '6px 9px', textAlign: 'right' }}>{money(r.capValue)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Portfolio summary */}
      {cat !== 'land' && (
        <div style={{ ...card, borderLeft: '6px solid #C9A84C' }}>
          <h3 style={h3}>Portfolio Offer</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {cat === 'income' && <Val label="Total NOI (all buildings)" value={money(analysis.sumNOI)} />}
            <Val label="Total Asking" value={money(analysis.sumAsking)} />
            <Val label={cat === 'income' ? 'Portfolio Offer (NOI pooled, 1.25 bank)' : 'Portfolio Offer (sum of MAOs)'} value={money(analysis.pooled)} />
            <Val label="Sum of per-building offers" value={money(analysis.sumOffers)} />
            {cat === 'income' && <Val label="Recommended portfolio range" value={`${money(analysis.range[0])} – ${money(analysis.range[1])}`} />}
            {analysis.pooledCap != null && <Val label={`Portfolio cap-multiplier (NOI × ${capMult})`} value={money(analysis.pooledCap)} />}
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            {cat === 'income'
              ? 'Pools all NOI and runs the income matrix once (one portfolio loan). Can differ slightly from the sum of per-building offers due to rounding — either is a valid lens.'
              : 'Flip portfolio = sum of each building’s MAO (no NOI to pool).'}
          </p>
          <button type="button" className="no-print" onClick={() => window.print()} style={{ marginTop: 8, padding: '8px 16px', borderRadius: 6, border: '1px solid #0A0F2C', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Print / Save PDF</button>
        </div>
      )}
    </div>
  )
}

function Val({ label, value }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 12, color: '#1E2A45', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 15 }}>{value}</div>
    </div>
  )
}
